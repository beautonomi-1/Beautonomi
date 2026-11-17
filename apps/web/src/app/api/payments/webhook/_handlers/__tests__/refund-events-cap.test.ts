/**
 * F2-33: Paystack `refund.processed` must cap the booking_refunds row it inserts
 * to the booking's remaining refundable balance (total_paid − total_refunded)
 * and open a reconciliation exception when the gateway amount exceeds it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRefundEvent } from "../refund-events";
import type { SupabaseClient } from "../shared";
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

function makeSupabase(booking: { total_paid: number; total_refunded: number }) {
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
            ? { data: null, error: null }
            : { data: { id: "pt-1", booking_id: "booking-1", amount: 300, metadata: {} }, error: null },
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
        chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
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
          data: {
            id: "booking-1",
            customer_id: "cust-1",
            booking_number: "BK-1",
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
    }),
  } as unknown as SupabaseClient;
  return { supabase, bookingRefundInserts, paymentTxInserts };
}

describe("Paystack refund.processed — remaining-balance cap (F2-33)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records the full gateway amount when it fits the remaining balance", async () => {
    const { supabase, bookingRefundInserts } = makeSupabase({ total_paid: 300, total_refunded: 0 });
    await handleRefundEvent(
      {
        event: "refund.processed",
        data: { transaction_reference: "ref-1", refund_reference: "rf-1", amount: 10_000, currency: "ZAR" },
      } as any,
      supabase,
    );
    expect(bookingRefundInserts).toHaveLength(1);
    expect(bookingRefundInserts[0]).toMatchObject({ amount: 100, status: "completed" });
    expect(recordReconciliationException).not.toHaveBeenCalled();
  });

  it("caps the booking refund to total_paid − total_refunded and records an exception", async () => {
    const { supabase, bookingRefundInserts } = makeSupabase({ total_paid: 300, total_refunded: 250 });
    await handleRefundEvent(
      {
        event: "refund.processed",
        data: { transaction_reference: "ref-1", refund_reference: "rf-2", amount: 10_000, currency: "ZAR" },
      } as any,
      supabase,
    );
    expect(bookingRefundInserts).toHaveLength(1);
    expect(bookingRefundInserts[0]).toMatchObject({ amount: 50, status: "completed" });
    expect(recordReconciliationException).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        psp: "paystack",
        externalId: "rf-2",
        internalId: "booking-1",
        amount: 50,
      }),
    );
  });

  it("inserts no booking refund when nothing is refundable, but still records the exception", async () => {
    const { supabase, bookingRefundInserts } = makeSupabase({ total_paid: 300, total_refunded: 300 });
    await handleRefundEvent(
      {
        event: "refund.processed",
        data: { transaction_reference: "ref-1", refund_reference: "rf-3", amount: 5_000, currency: "ZAR" },
      } as any,
      supabase,
    );
    expect(bookingRefundInserts).toHaveLength(0);
    expect(recordReconciliationException).toHaveBeenCalledTimes(1);
  });
});
