/**
 * F2-33: Stripe `refund.created` must cap the booking_refunds row to the
 * booking's remaining refundable balance and record a reconciliation exception
 * when the gateway amount exceeds it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordReconciliationException } from "@/lib/finance/record-reconciliation-exception";

const mockSupabase = { from: vi.fn(), rpc: vi.fn() };

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockSupabase,
}));
vi.mock("@/lib/finance/record-reconciliation-exception", () => ({
  recordReconciliationException: vi.fn(async () => undefined),
}));
vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/bookings/resolve-booking-refund-payment-id", () => ({
  resolveBookingPaymentIdForRefund: vi.fn(async () => "bp-1"),
}));
vi.mock("@/lib/finance/sync-payment-transaction-refund", () => ({
  syncPaymentTransactionRefundState: vi.fn(async () => ({ synced: true, transactionId: null })),
}));
vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyHighValueRefund: vi.fn(),
}));

function wire(booking: { total_paid: number; total_refunded: number }) {
  const bookingRefundInserts: Array<Record<string, unknown>> = [];
  mockSupabase.from.mockImplementation((table: string) => {
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
          ? { data: null, error: null }
          : {
              data: { id: "pt-1", booking_id: "booking-1", amount: 300, metadata: {}, provider: "stripe" },
              error: null,
            },
      );
      chain.insert = vi.fn(async () => ({ data: null, error: null }));
      return chain;
    }
    if (table === "booking_refunds") {
      class Q {
        select() {
          return this;
        }
        eq() {
          return this;
        }
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        }
        then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: bookingRefundInserts, error: null }));
        }
        insert(row: Record<string, unknown>) {
          bookingRefundInserts.push(row);
          return Promise.resolve({ data: row, error: null });
        }
        delete() {
          return this;
        }
      }
      return new Q();
    }
    if (table === "bookings") {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({
        data: {
          id: "booking-1",
          tenant_id: "tenant-1",
          provider_id: "prov-1",
          currency: "ZAR",
          total_paid: booking.total_paid,
          total_refunded: booking.total_refunded,
        },
        error: null,
      }));
      return chain;
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { bookingRefundInserts };
}

describe("handleStripeRefundCreated — remaining-balance cap (F2-33)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("caps to remaining balance and records a reconciliation exception", async () => {
    const { bookingRefundInserts } = wire({ total_paid: 300, total_refunded: 280 });
    const { handleStripeRefundCreated } = await import("../stripe-settlement");
    await handleStripeRefundCreated({ id: "re_cap", payment_intent: "pi_1", amount: 10_000, currency: "zar" });

    expect(bookingRefundInserts).toHaveLength(1);
    expect(bookingRefundInserts[0]).toMatchObject({ amount: 20, refund_provider_id: "re_cap" });
    expect(recordReconciliationException).toHaveBeenCalledWith(
      expect.objectContaining({ psp: "stripe", externalId: "re_cap", internalId: "booking-1", amount: 80 }),
    );
  }, 120_000);

  it("records the full amount when it fits", async () => {
    const { bookingRefundInserts } = wire({ total_paid: 300, total_refunded: 0 });
    const { handleStripeRefundCreated } = await import("../stripe-settlement");
    await handleStripeRefundCreated({ id: "re_ok", payment_intent: "pi_1", amount: 10_000, currency: "zar" });

    expect(bookingRefundInserts).toHaveLength(1);
    expect(bookingRefundInserts[0]).toMatchObject({ amount: 100 });
    expect(recordReconciliationException).not.toHaveBeenCalled();
  }, 120_000);
});
