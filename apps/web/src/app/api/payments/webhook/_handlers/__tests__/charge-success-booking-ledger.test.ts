/**
 * Characterization tests for Paystack booking ledger wiring in charge-success.ts.
 * Row-shape golden tests live in record-booking-online-charge-ledger.test.ts; these
 * assert webhook-specific parity quirks (QA-1/QA-2) and idempotency short-circuits.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { processSuccessfulPayment } from "../charge-success";
import type { SupabaseClient } from "../shared";
import { recordBookingOnlineChargeLedger } from "@/lib/bookings/record-booking-online-charge-ledger";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/payments/resolve-paystack-fee", () => ({
  resolvePaystackFeeMajor: vi.fn(async () => ({
    feesMajor: 2,
    feeSource: "paystack_webhook",
  })),
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
}));

vi.mock("@/lib/finance/resolve-commission-percentage", () => ({
  resolveCommissionPercentageForProvider: vi.fn(async () => 10),
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

function makeProcessPaymentSupabase(options: {
  booking: Record<string, unknown>;
  existingPaymentTx?: boolean;
  existingFinancePayment?: boolean;
  existingBookingPayment?: { id: string } | null;
  financeInserts?: Array<Record<string, unknown>>;
  giftCaptureResult?: boolean | null;
}) {
  const financeInserts = options.financeInserts ?? [];
  const bookingUpdates: Array<Record<string, unknown>> = [];
  const paymentUpdates: Array<Record<string, unknown>> = [];

  const supabase = {
    from: vi.fn((table: string) => {
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
            return {
              eq: vi.fn(async () => ({ data: null, error: null })),
            };
          }),
        };
      }
      if (table === "payment_transactions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: options.existingPaymentTx ? { id: "pt-1" } : null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      if (table === "finance_transactions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: unknown) => ({
              eq: vi.fn((col2: string, val2: unknown) => ({
                maybeSingle: vi.fn(async () => {
                  if (
                    col === "booking_id" &&
                    col2 === "transaction_type" &&
                    val2 === "payment"
                  ) {
                    return {
                      data: options.existingFinancePayment ? { id: "ft-payment" } : null,
                      error: null,
                    };
                  }
                  if (col2 === "transaction_type" && val2 === "promotion_discount") {
                    return { data: null, error: null };
                  }
                  return { data: null, error: null };
                }),
              })),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
          insert: vi.fn((row: Record<string, unknown>) => {
            financeInserts.push(row);
            return Promise.resolve({ data: row, error: null });
          }),
        };
      }
      if (table === "payments") {
        return {
          update: vi.fn((values: Record<string, unknown>) => {
            paymentUpdates.push(values);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            };
          }),
        };
      }
      if (table === "booking_payments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: options.existingBookingPayment ?? null,
                  error: null,
                })),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: "bp-remain-1" },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "providers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { user_id: "provider-user-1" }, error: null })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      };
    }),
    rpc: vi.fn(async () => ({ data: options.giftCaptureResult ?? true, error: null })),
  };

  return {
    supabase: supabase as unknown as SupabaseClient,
    financeInserts,
    bookingUpdates,
    paymentUpdates,
  };
}

const baseBooking = {
  id: "booking-1",
  booking_number: "BK-1001",
  customer_id: "customer-1",
  provider_id: "provider-1",
  tenant_id: "tenant-1",
  total_amount: 208,
  tip_amount: 10,
  tax_amount: 0,
  travel_fee: 120,
  platform_fee_amount: 18,
  service_fee_amount: 0,
  platform_service_fee: 0,
  promotion_discount_amount: 0,
  promotion_id: null,
  currency: "ZAR",
};

describe("charge.success booking ledger wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recordBookingOnlineChargeLedger).mockResolvedValue({
      ok: true,
      skipped: false,
      isSecondCharge: false,
    });
  });

  it("passes ungated gift card amount to the shared writer when capture fails (QA-1)", async () => {
    const { supabase } = makeProcessPaymentSupabase({
      booking: baseBooking,
      giftCaptureResult: false,
    });

    await processSuccessfulPayment(
      {
        reference: "ref-gift-fail",
        amount: 20800,
        fees: 200,
        customer: { email: "a@example.com", customer_code: "CUS_1" },
        metadata: {
          booking_id: "booking-1",
          gift_card_amount_applied: 25,
          wallet_amount_applied: 0,
          payment_option: "full",
          requires_deposit: false,
        },
      },
      supabase,
    );

    expect(recordBookingOnlineChargeLedger).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        giftCardAmountApplied: 25,
        auditLegStyle: "paystack_standard",
      }),
    );
    const { ensureWalletGiftBookingPayments } = await import(
      "@/lib/bookings/ensure-wallet-gift-booking-payments"
    );
    expect(ensureWalletGiftBookingPayments).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        giftCardAmount: 0,
      }),
    );
  });

  it("does not post promotion_discount when promotion_id is null (QA-2)", async () => {
    const { supabase, financeInserts } = makeProcessPaymentSupabase({
      booking: {
        ...baseBooking,
        promotion_discount_amount: 15,
        promotion_id: null,
      },
    });

    await processSuccessfulPayment(
      {
        reference: "ref-no-promo-id",
        amount: 20800,
        fees: 200,
        customer: { email: "a@example.com" },
        metadata: {
          booking_id: "booking-1",
          payment_option: "full",
          requires_deposit: false,
        },
      },
      supabase,
    );

    expect(
      financeInserts.some((row) => row.transaction_type === "promotion_discount"),
    ).toBe(false);
  });

  it("runs completeWalletGiftSyntheticPayments and returns before ensureWalletGift when ledger skips", async () => {
    vi.mocked(recordBookingOnlineChargeLedger).mockResolvedValueOnce({
      ok: true,
      skipped: true,
      isSecondCharge: false,
    });

    const { supabase } = makeProcessPaymentSupabase({ booking: baseBooking });
    const { ensureWalletGiftBookingPayments, completeWalletGiftSyntheticPayments } = await import(
      "@/lib/bookings/ensure-wallet-gift-booking-payments"
    );

    await processSuccessfulPayment(
      {
        reference: "ref-skipped",
        amount: 20800,
        fees: 200,
        customer: { email: "a@example.com" },
        metadata: {
          booking_id: "booking-1",
          payment_option: "full",
          requires_deposit: false,
        },
      },
      supabase,
    );

    expect(completeWalletGiftSyntheticPayments).toHaveBeenCalled();
    expect(ensureWalletGiftBookingPayments).not.toHaveBeenCalled();
  });

  it("pay-remaining backfills via shared writer when booking_payments already exists (QA-4)", async () => {
    const { supabase } = makeProcessPaymentSupabase({
      booking: baseBooking,
      existingBookingPayment: { id: "bp-existing" },
    });

    await processSuccessfulPayment(
      {
        reference: "ref-remain-backfill",
        amount: 10800,
        fees: 200,
        customer: { email: "a@example.com", customer_code: "CUS_1" },
        metadata: {
          booking_id: "booking-1",
          payment_type: "booking_remaining",
        },
      },
      supabase,
    );

    expect(recordBookingOnlineChargeLedger).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        reference: "ref-remain-backfill",
        sourcePaymentId: "bp-existing",
        paymentTransactionType: "charge",
        auditLegStyle: "paystack_pay_remaining",
        descriptions: {
          payment: "Remaining balance for booking BK-1001",
          providerEarnings: "Provider earnings (remaining balance) for booking BK-1001",
        },
      }),
    );
  });
});
