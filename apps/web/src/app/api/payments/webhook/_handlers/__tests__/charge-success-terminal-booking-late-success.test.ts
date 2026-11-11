/**
 * F2-08 / F2-16: a late `charge.success` for a booking that is already in a
 * money-terminal state (cancelled / no_show / declined) must never mark the
 * booking paid or post ledger rows. It must auto-refund the charge, record a
 * reconciliation exception and return (webhook acks 200).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processSuccessfulPayment } from "../charge-success";
import type { SupabaseClient } from "../shared";
import { recordBookingOnlineChargeLedger } from "@/lib/bookings/record-booking-online-charge-ledger";
import { recordBookingPaystackPayment } from "@/lib/bookings/record-booking-paystack-payment";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { recordReconciliationException } from "@/lib/finance/record-reconciliation-exception";

const refundGatewayChargeMock = vi.fn();

vi.mock("@/lib/payments/refund-gateway-charge", () => ({
  refundGatewayCharge: (...args: unknown[]) => refundGatewayChargeMock(...args),
}));

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/payments/resolve-paystack-fee", () => ({
  resolvePaystackFeeMajor: vi.fn(async () => ({ feesMajor: 2, feeSource: "paystack_webhook" })),
}));

vi.mock("@/lib/bookings/record-booking-paystack-payment", () => ({
  recordBookingPaystackPayment: vi.fn(async () => ({
    ok: true,
    bookingPaymentId: "bp-1",
    paymentProviderId: "ref-1",
    inserted: true,
  })),
}));

vi.mock("@/lib/bookings/sync-booking-after-paystack-success", () => ({
  syncBookingAfterPaystackSuccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/bookings/ensure-wallet-gift-booking-payments", () => ({
  ensureWalletGiftBookingPayments: vi.fn(async () => undefined),
  completeWalletGiftSyntheticPayments: vi.fn(async () => undefined),
  sumPendingWalletGiftBookingPayments: vi.fn(async () => 0),
}));

vi.mock("@/lib/finance/resolve-commission-percentage-for-booking", () => ({
  resolveCommissionPercentageForBooking: vi.fn(async () => 10),
}));

vi.mock("@/lib/bookings/record-booking-online-charge-ledger", () => ({
  recordBookingOnlineChargeLedger: vi.fn(async () => ({
    ok: true,
    skipped: false,
    isSecondCharge: false,
  })),
}));

vi.mock("@/lib/promotions/record-promotion-usage", () => ({
  recordPromotionUsage: vi.fn(async () => undefined),
}));

vi.mock("@/lib/recurring/try-create-recurring-from-paystack-metadata", () => ({
  tryCreateCustomerRecurringFromPaystackChargeMetadata: vi.fn(async () => undefined),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/locale/tenant-locale", () => ({
  getTenantLocaleTagFromRegionConfig: vi.fn(() => "en-ZA"),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: vi.fn(async () => undefined),
  sendToUser: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: vi.fn(async () => undefined),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(async () => undefined),
}));

vi.mock("@/lib/finance/record-reconciliation-exception", () => ({
  recordReconciliationException: vi.fn(async () => undefined),
}));

vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyUnrecognizedPayments: vi.fn(),
  slackNotifyPaymentFailed: vi.fn(),
}));

vi.mock("@/lib/wallet/enrich-wallet-topup-metadata-from-reference", () => ({
  enrichWalletTopupMetadataFromReference: vi.fn(async () => undefined),
}));

const mockVerifyBookingCharge = vi.fn(async () => ({
  ok: true as const,
  amountMajor: 200,
  currency: "ZAR",
  pendingPayment: {
    amount: 200,
    currency: "ZAR",
    metadata: {},
    payment_provider_transaction_id: "ref-1",
  },
}));

vi.mock("@/lib/bookings/verify-paystack-booking-charge", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/bookings/verify-paystack-booking-charge")>();
  return {
    ...actual,
    verifyBookingCharge: (...args: unknown[]) => mockVerifyBookingCharge(...args),
    verifyPaystackBookingCharge: (...args: unknown[]) => mockVerifyBookingCharge(...args),
  };
});

type PaymentTxRow = { id: string; status: string; metadata?: Record<string, unknown> | null };

function makeSupabase(options: {
  booking: Record<string, unknown>;
  /** Rows returned for payment_transactions filtered by (provider, reference) */
  paymentTxRows: PaymentTxRow[];
}) {
  const bookingUpdates: Array<Record<string, unknown>> = [];
  const paymentTxUpdates: Array<Record<string, unknown>> = [];
  const paymentTxStatusFilters: Array<unknown> = [];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "ads_budget_orders" || table === "provider_subscription_orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: options.booking, error: null })),
              maybeSingle: vi.fn(async () => ({ data: options.booking, error: null })),
            })),
          })),
          update: vi.fn((values: Record<string, unknown>) => {
            bookingUpdates.push(values);
            return { eq: vi.fn(async () => ({ data: null, error: null })) };
          }),
        };
      }
      if (table === "payment_transactions") {
        // Flexible chain: select().eq().eq()[.in()].maybeSingle()/.limit()
        let statusFilter: string[] | null = null;
        const resolve = () => {
          const rows = statusFilter
            ? options.paymentTxRows.filter((r) => statusFilter!.includes(r.status))
            : options.paymentTxRows;
          return rows;
        };
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.in = vi.fn((_col: string, values: string[]) => {
          statusFilter = values;
          paymentTxStatusFilters.push(values);
          return chain;
        });
        chain.limit = vi.fn(async () => ({ data: resolve(), error: null }));
        chain.maybeSingle = vi.fn(async () => ({ data: resolve()[0] ?? null, error: null }));
        chain.update = vi.fn((values: Record<string, unknown>) => {
          paymentTxUpdates.push(values);
          return { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })) };
        });
        return chain;
      }
      // Anything else: inert chain
      const inert: Record<string, unknown> = {};
      inert.select = vi.fn(() => inert);
      inert.eq = vi.fn(() => inert);
      inert.in = vi.fn(() => inert);
      inert.limit = vi.fn(async () => ({ data: [], error: null }));
      inert.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      inert.single = vi.fn(async () => ({ data: null, error: null }));
      inert.insert = vi.fn(async () => ({ data: null, error: null }));
      inert.update = vi.fn(() => inert);
      inert.delete = vi.fn(() => inert);
      return inert;
    }),
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };

  return {
    supabase: supabase as unknown as SupabaseClient,
    bookingUpdates,
    paymentTxUpdates,
    paymentTxStatusFilters,
  };
}

const cancelledBooking = {
  id: "booking-1",
  booking_number: "BK-2001",
  customer_id: "customer-1",
  provider_id: "provider-1",
  tenant_id: "tenant-1",
  status: "cancelled",
  payment_status: "pending",
  total_amount: 200,
  tip_amount: 0,
  tax_amount: 0,
  travel_fee: 0,
  platform_fee_amount: 0,
  service_fee_amount: 0,
  platform_service_fee: 0,
  promotion_discount_amount: 0,
  promotion_id: null,
  currency: "ZAR",
};

const chargeEvent = {
  reference: "ref-late-1",
  amount: 20_000,
  fees: 200,
  currency: "ZAR",
  customer: { email: "a@example.com", customer_code: "CUS_1" },
  metadata: {
    booking_id: "booking-1",
    payment_option: "full",
    requires_deposit: false,
  },
};

describe("charge.success on a terminal (cancelled/no_show) booking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refundGatewayChargeMock.mockResolvedValue({ provider: "paystack", refundId: "rf-1" });
  });

  it("F2-08: cancelled booking with no prior tx → refund, reconciliation exception, no paid/ledger", async () => {
    const { supabase, bookingUpdates } = makeSupabase({
      booking: cancelledBooking,
      paymentTxRows: [],
    });

    await processSuccessfulPayment(chargeEvent as any, supabase);

    expect(refundGatewayChargeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "ref-late-1",
        amountMajor: 200,
        currency: "ZAR",
        tenantId: "tenant-1",
        idempotencyKey: "booking_late_success_refund:booking-1:ref-late-1",
        fallbackProvider: "paystack",
      }),
    );
    expect(recordReconciliationException).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        psp: "paystack",
        externalId: "ref-late-1",
        internalId: "booking-1",
        amount: 200,
      }),
    );
    expect(recordBookingPaystackPayment).not.toHaveBeenCalled();
    expect(recordBookingOnlineChargeLedger).not.toHaveBeenCalled();
    expect(syncBookingAfterPaystackSuccess).not.toHaveBeenCalled();
    expect(bookingUpdates.some((u) => "payment_reference" in u || "payment_status" in u)).toBe(false);
  });

  it("F2-16: failed-then-success — a `failed` payment_transactions row must not be treated as settled", async () => {
    const { supabase, bookingUpdates, paymentTxUpdates } = makeSupabase({
      booking: cancelledBooking,
      paymentTxRows: [{ id: "pt-failed", status: "failed", metadata: {} }],
    });

    await processSuccessfulPayment(chargeEvent as any, supabase);

    expect(refundGatewayChargeMock).toHaveBeenCalledTimes(1);
    expect(recordReconciliationException).toHaveBeenCalledTimes(1);
    expect(recordBookingPaystackPayment).not.toHaveBeenCalled();
    expect(recordBookingOnlineChargeLedger).not.toHaveBeenCalled();
    expect(syncBookingAfterPaystackSuccess).not.toHaveBeenCalled();
    expect(bookingUpdates.some((u) => "payment_reference" in u || "payment_status" in u)).toBe(false);
    // The failed tx row is flagged so ops can see it was auto-refunded.
    expect(paymentTxUpdates.length).toBeGreaterThan(0);
    expect(paymentTxUpdates[0]).toMatchObject({ status: "refunded" });
  });

  it("no_show booking is treated the same as cancelled", async () => {
    const { supabase } = makeSupabase({
      booking: { ...cancelledBooking, status: "no_show" },
      paymentTxRows: [],
    });

    await processSuccessfulPayment(chargeEvent as any, supabase);

    expect(refundGatewayChargeMock).toHaveBeenCalledTimes(1);
    expect(recordBookingOnlineChargeLedger).not.toHaveBeenCalled();
  });

  it("when the auto-refund fails it still records the exception and flags requires_refund without marking paid", async () => {
    refundGatewayChargeMock.mockRejectedValueOnce(new Error("gateway down"));
    const { supabase, paymentTxUpdates } = makeSupabase({
      booking: cancelledBooking,
      paymentTxRows: [{ id: "pt-failed", status: "failed", metadata: {} }],
    });

    await expect(processSuccessfulPayment(chargeEvent as any, supabase)).resolves.toBeUndefined();

    expect(recordReconciliationException).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ requires_refund: true }),
      }),
    );
    expect(recordBookingOnlineChargeLedger).not.toHaveBeenCalled();
    expect(paymentTxUpdates[0]?.metadata).toMatchObject({ requires_refund: true });
  });

  it("a charge that was already settled before cancellation is left alone (idempotent, no second refund)", async () => {
    const { supabase } = makeSupabase({
      booking: cancelledBooking,
      paymentTxRows: [{ id: "pt-ok", status: "success", metadata: {} }],
    });

    await processSuccessfulPayment(chargeEvent as any, supabase);

    expect(refundGatewayChargeMock).not.toHaveBeenCalled();
    expect(recordBookingOnlineChargeLedger).not.toHaveBeenCalled();
    expect(syncBookingAfterPaystackSuccess).not.toHaveBeenCalled();
  });

  it("an active (confirmed) booking still settles normally", async () => {
    const { supabase } = makeSupabase({
      booking: { ...cancelledBooking, status: "confirmed" },
      paymentTxRows: [],
    });

    await processSuccessfulPayment(chargeEvent as any, supabase);

    expect(refundGatewayChargeMock).not.toHaveBeenCalled();
    expect(recordBookingOnlineChargeLedger).toHaveBeenCalledTimes(1);
  });
});
