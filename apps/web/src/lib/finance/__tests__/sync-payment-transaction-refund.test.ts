import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncPaymentTransactionRefundState } from "../sync-payment-transaction-refund";

type ChargeRow = {
  id: string;
  amount: number;
  refund_amount: number | null;
  status: string;
  transaction_type?: string;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
};

function makeSupabase(chargeRows: ChargeRow[]) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [{ id: chargeRows[0]?.id ?? "tx-1" }], error: null }),
      }),
    }),
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "payment_transactions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: chargeRows }),
                }),
              }),
            }),
          }),
          update,
        };
      }
      return { select: vi.fn() };
    }),
    _update: update,
  } as unknown as import("@supabase/supabase-js").SupabaseClient & { _update: ReturnType<typeof vi.fn> };
}

describe("syncPaymentTransactionRefundState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates charge row when cumulative refund increases", async () => {
    const supabase = makeSupabase([
      { id: "tx-1", amount: 208, refund_amount: 0, status: "success", transaction_type: "charge" },
    ]);

    const result = await syncPaymentTransactionRefundState({
      supabase,
      bookingId: "booking-1",
      cumulativeRefundAmount: 208,
      reason: "Cancellation refund",
    });

    expect(result.synced).toBe(true);
    expect(result.transactionId).toBe("tx-1");
    expect(supabase._update).toHaveBeenCalled();
  });

  it("skips when txn already at target refund amount", async () => {
    const supabase = makeSupabase([
      { id: "tx-1", amount: 208, refund_amount: 208, status: "refunded", transaction_type: "charge" },
    ]);

    const result = await syncPaymentTransactionRefundState({
      supabase,
      bookingId: "booking-1",
      cumulativeRefundAmount: 250,
      reason: "Cancellation refund",
    });

    expect(result.synced).toBe(false);
    expect(supabase._update).not.toHaveBeenCalled();
  });

  it("caps sync target to the charge amount", async () => {
    const supabase = makeSupabase([
      { id: "tx-1", amount: 50, refund_amount: 0, status: "success", transaction_type: "charge" },
    ]);

    await syncPaymentTransactionRefundState({
      supabase,
      bookingId: "booking-1",
      cumulativeRefundAmount: 208,
      reason: "Cancellation refund",
    });

    expect(supabase._update).toHaveBeenCalledWith(
      expect.objectContaining({
        refund_amount: 50,
      }),
    );
  });

  it("allocates primary charge before walk-in extra", async () => {
    const supabase = makeSupabase([
      {
        id: "extra-1",
        amount: 50,
        refund_amount: 0,
        status: "success",
        transaction_type: "charge",
        metadata: { kind: "walk_in_additional_charge" },
        created_at: "2026-01-02T00:00:00Z",
      },
      {
        id: "tx-1",
        amount: 200,
        refund_amount: 0,
        status: "success",
        transaction_type: "charge",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);

    await syncPaymentTransactionRefundState({
      supabase,
      bookingId: "booking-1",
      cumulativeRefundAmount: 220,
      reason: "Cancellation refund",
    });

    expect(supabase._update).toHaveBeenCalled();
  });
});
