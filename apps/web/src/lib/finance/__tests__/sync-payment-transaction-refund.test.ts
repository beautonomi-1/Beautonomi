import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncPaymentTransactionRefundState } from "../sync-payment-transaction-refund";

function makeSupabase(opts: {
  chargeTxns?: Array<{ id: string; transaction_type?: string }>;
  txn?: { id: string; amount: number; refund_amount: number | null; status: string } | null;
  updateResult?: Array<{ id: string }>;
}) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: opts.updateResult ?? [{ id: "tx-1" }], error: null }),
      }),
    }),
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "payment_transactions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => {
              if (val === "booking-1") {
                return {
                  in: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      order: vi.fn().mockResolvedValue({ data: opts.chargeTxns ?? [{ id: "tx-1", transaction_type: "charge" }] }),
                    }),
                  }),
                };
              }
              return {
                maybeSingle: vi.fn().mockResolvedValue({ data: opts.txn ?? null }),
              };
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
    const supabase = makeSupabase({
      txn: { id: "tx-1", amount: 208, refund_amount: 0, status: "success" },
    });

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
    const supabase = makeSupabase({
      txn: { id: "tx-1", amount: 208, refund_amount: 208, status: "refunded" },
    });

    const result = await syncPaymentTransactionRefundState({
      supabase,
      bookingId: "booking-1",
      cumulativeRefundAmount: 250,
      originalChargeAmount: 208,
      reason: "Cancellation refund",
    });

    expect(result.synced).toBe(false);
    expect(supabase._update).not.toHaveBeenCalled();
  });

  it("caps sync target to the charge amount", async () => {
    const supabase = makeSupabase({
      txn: { id: "tx-1", amount: 50, refund_amount: 0, status: "success" },
    });

    await syncPaymentTransactionRefundState({
      supabase,
      bookingId: "booking-1",
      cumulativeRefundAmount: 208,
      originalChargeAmount: 50,
      reason: "Cancellation refund",
    });

    expect(supabase._update).toHaveBeenCalledWith(
      expect.objectContaining({
        refund_amount: 50,
      }),
    );
  });
});
