/**
 * F2-26: Flutterwave `refund.completed` webhook handler mirrors the Paystack
 * refund.processed path (payment_transactions refund row + booking_refunds row,
 * idempotent on the refund id) with the F2-33 remaining-balance cap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleFlutterwaveRefundWebhook } from "@/lib/payments/flutterwave-refund-webhook";
import { recordReconciliationException } from "@/lib/finance/record-reconciliation-exception";

vi.mock("@/lib/finance/record-reconciliation-exception", () => ({
  recordReconciliationException: vi.fn(async () => undefined),
}));
vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/bookings/resolve-booking-refund-payment-id", () => ({
  resolveBookingPaymentIdForRefund: vi.fn(async () => "bp-1"),
}));
vi.mock("@/lib/payments/apply-non-booking-refund-from-transaction", () => ({
  applyNonBookingRefundFromTransaction: vi.fn(async () => undefined),
}));
vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: vi.fn(async () => undefined),
}));
vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: vi.fn(async () => undefined),
}));
vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyHighValueRefund: vi.fn(),
}));

function makeSupabase(opts: {
  booking: { total_paid: number; total_refunded: number } | null;
  existingRefundTx?: boolean;
  existingBookingRefund?: boolean;
}) {
  const bookingRefundInserts: Array<Record<string, unknown>> = [];
  const paymentTxInserts: Array<Record<string, unknown>> = [];
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "payment_transactions") {
        const chain: Record<string, unknown> = {};
        let isRefundLookup = false;
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn((col: string, val: unknown) => {
          if (col === "transaction_type" && val === "refund") isRefundLookup = true;
          return chain;
        });
        chain.in = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () =>
          isRefundLookup
            ? { data: opts.existingRefundTx ? { id: "rt-1" } : null, error: null }
            : {
                data: opts.booking
                  ? { id: "pt-1", booking_id: "booking-1", amount: 300, metadata: {}, provider: "flutterwave" }
                  : null,
                error: null,
              },
        );
        chain.insert = vi.fn(async (row: Record<string, unknown>) => {
          paymentTxInserts.push(row);
          return { data: null, error: null };
        });
        return chain;
      }
      if (table === "booking_refunds") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => ({
          data: opts.existingBookingRefund ? { id: "br-1" } : null,
          error: null,
        }));
        chain.insert = vi.fn(async (row: Record<string, unknown>) => {
          bookingRefundInserts.push(row);
          return { data: null, error: null };
        });
        return chain;
      }
      if (table === "bookings") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => ({
          data: opts.booking
            ? {
                id: "booking-1",
                customer_id: "cust-1",
                booking_number: "BK-1",
                tenant_id: "tenant-1",
                provider_id: "prov-1",
                currency: "ZAR",
                total_paid: opts.booking.total_paid,
                total_refunded: opts.booking.total_refunded,
              }
            : null,
          error: null,
        }));
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as any;
  return { supabase, bookingRefundInserts, paymentTxInserts };
}

const refundEvent = {
  id: 55001,
  amount_refunded: 100,
  status: "completed",
  tx_ref: "ref-flw-1",
  flw_ref: "FLW-REF-1",
  currency: "ZAR",
  comment: "Customer request",
};

describe("handleFlutterwaveRefundWebhook (F2-26)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a refund payment_transactions row and a completed booking_refunds row (major units)", async () => {
    const { supabase, bookingRefundInserts, paymentTxInserts } = makeSupabase({
      booking: { total_paid: 300, total_refunded: 0 },
    });

    const result = await handleFlutterwaveRefundWebhook(refundEvent, supabase);

    expect(result.handled).toBe(true);
    expect(paymentTxInserts).toHaveLength(1);
    expect(paymentTxInserts[0]).toMatchObject({
      provider: "flutterwave",
      transaction_type: "refund",
      status: "refunded",
      amount: 100,
      reference: "55001",
      booking_id: "booking-1",
    });
    expect(bookingRefundInserts).toHaveLength(1);
    expect(bookingRefundInserts[0]).toMatchObject({
      booking_id: "booking-1",
      amount: 100,
      refund_method: "original",
      refund_provider_id: "55001",
      status: "completed",
      payment_id: "bp-1",
    });
    expect(recordReconciliationException).not.toHaveBeenCalled();
  });

  it("is idempotent on the Flutterwave refund id", async () => {
    const { supabase, bookingRefundInserts, paymentTxInserts } = makeSupabase({
      booking: { total_paid: 300, total_refunded: 100 },
      existingRefundTx: true,
    });
    await handleFlutterwaveRefundWebhook(refundEvent, supabase);
    expect(paymentTxInserts).toHaveLength(0);
    expect(bookingRefundInserts).toHaveLength(0);
  });

  it("caps the booking refund to the remaining balance (F2-33) and records an exception", async () => {
    const { supabase, bookingRefundInserts } = makeSupabase({
      booking: { total_paid: 300, total_refunded: 260 },
    });
    await handleFlutterwaveRefundWebhook(refundEvent, supabase);
    expect(bookingRefundInserts).toHaveLength(1);
    expect(bookingRefundInserts[0]).toMatchObject({ amount: 40 });
    expect(recordReconciliationException).toHaveBeenCalledWith(
      expect.objectContaining({ psp: "flutterwave", externalId: "55001", internalId: "booking-1", amount: 60 }),
    );
  });

  it("ignores non-completed refund statuses", async () => {
    const { supabase, bookingRefundInserts, paymentTxInserts } = makeSupabase({
      booking: { total_paid: 300, total_refunded: 0 },
    });
    const result = await handleFlutterwaveRefundWebhook({ ...refundEvent, status: "pending" }, supabase);
    expect(result.handled).toBe(false);
    expect(paymentTxInserts).toHaveLength(0);
    expect(bookingRefundInserts).toHaveLength(0);
  });
});
