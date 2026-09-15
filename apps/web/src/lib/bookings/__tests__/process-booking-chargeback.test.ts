import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isPlatformBillingPaymentKind,
  processBookingChargeback,
  shouldProcessPaystackDisputeChargeback,
} from "../process-booking-chargeback";

const syncMock = vi.fn().mockResolvedValue({ synced: true });

vi.mock("@/lib/finance/sync-payment-transaction-refund", () => ({
  syncPaymentTransactionRefundState: (...args: unknown[]) => syncMock(...args),
}));

vi.mock("@/lib/bookings/resolve-booking-refund-payment-id", () => ({
  resolveBookingPaymentIdForRefund: vi.fn().mockResolvedValue("bp-1"),
}));

describe("shouldProcessPaystackDisputeChargeback", () => {
  it("processes dispute.create", () => {
    expect(shouldProcessPaystackDisputeChargeback("dispute.create", {})).toBe(true);
  });

  it("skips dispute.remind", () => {
    expect(shouldProcessPaystackDisputeChargeback("dispute.remind", {})).toBe(false);
  });

  it("skips merchant-won resolve", () => {
    expect(
      shouldProcessPaystackDisputeChargeback("dispute.resolve", {
        resolution: "merchant-accepted",
      }),
    ).toBe(false);
  });

  it("processes customer-won resolve", () => {
    expect(
      shouldProcessPaystackDisputeChargeback("dispute.resolve", {
        resolution: "declined",
      }),
    ).toBe(true);
  });
});

describe("isPlatformBillingPaymentKind", () => {
  it("recognizes platform billing kinds", () => {
    expect(isPlatformBillingPaymentKind("ads_budget_order")).toBe(true);
    expect(isPlatformBillingPaymentKind("booking")).toBe(false);
    expect(isPlatformBillingPaymentKind(undefined)).toBe(false);
  });
});

describe("processBookingChargeback", () => {
  const insertMock = vi.fn();
  const fromMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    syncMock.mockClear();

    insertMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "ref-1" }, error: null }),
      }),
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "booking_refunds") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: insertMock,
        };
      }
      if (table === "payment_transactions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: "pt-1",
                      booking_id: "booking-1",
                      amount: 200,
                      metadata: {},
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "bookings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { total_paid: 200, total_refunded: 0, currency: "ZAR" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "booking_events") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    });
  });

  it("inserts completed booking_refunds for booking payments", async () => {
    const result = await processBookingChargeback({
      supabase: { from: fromMock } as never,
      paymentProvider: "paystack",
      reference: "ref_booking_1",
      disputeId: "disp_1",
      amountMajor: 200,
    });

    expect(result.processed).toBe(true);
    expect(result.refundId).toBe("ref-1");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: "booking-1",
        refund_method: "original",
        status: "completed",
        refund_provider_id: "chargeback:paystack:disp_1",
      }),
    );
    expect(syncMock).toHaveBeenCalled();
  });

  it("is idempotent when chargeback refund already exists", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "booking_refunds") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "existing", amount: 150 },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await processBookingChargeback({
      supabase: { from: fromMock } as never,
      paymentProvider: "stripe",
      reference: "pi_1",
      disputeId: "dp_1",
    });

    expect(result.processed).toBe(true);
    expect(result.reason).toBe("already_recorded");
    expect(insertMock).not.toHaveBeenCalled();
  });
});
