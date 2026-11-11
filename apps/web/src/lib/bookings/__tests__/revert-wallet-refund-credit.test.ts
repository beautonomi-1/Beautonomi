/**
 * F2-57: provider wallet refund — if `booking_refunds` finalize fails AFTER the
 * wallet was credited, the credit must be reverted (idempotently) and the
 * refund marked failed; if the revert also fails, a reconciliation exception
 * must be opened so the exposure is visible.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revertWalletRefundCreditAfterFinalizeFailure } from "../revert-wallet-refund-credit";

function makeSupabase(opts: { debitError?: { message: string } | null }) {
  const rpc = vi.fn(async () => ({ data: null, error: opts.debitError ?? null }));
  const refundUpdates: Array<Record<string, unknown>> = [];
  const exceptionInserts: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    if (table === "booking_refunds") {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          refundUpdates.push(patch);
          return { eq: vi.fn(async () => ({ error: null })) };
        }),
      };
    }
    if (table === "reconciliation_exceptions") {
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          exceptionInserts.push(row);
          return { error: null };
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { supabase: { rpc, from } as any, rpc, refundUpdates, exceptionInserts };
}

const baseParams = {
  refundId: "refund-1",
  bookingId: "booking-1",
  customerId: "cust-1",
  amount: 150,
  currency: "ZAR",
  tenantId: "tenant-1",
  finalizeErrorMessage: "db timeout",
};

describe("revertWalletRefundCreditAfterFinalizeFailure (F2-57)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("debits the wallet back idempotently and marks the refund failed", async () => {
    const { supabase, rpc, refundUpdates, exceptionInserts } = makeSupabase({});
    const result = await revertWalletRefundCreditAfterFinalizeFailure(supabase, baseParams);

    expect(result).toEqual({ reverted: true });
    expect(rpc).toHaveBeenCalledWith(
      "wallet_debit_admin",
      expect.objectContaining({
        p_user_id: "cust-1",
        p_amount: 150,
        p_currency: "ZAR",
        p_reference_id: "booking-1",
        p_reference_type: "booking_refund_reversal",
        p_idempotency_key: "provider_booking_refund_revert:refund-1",
      }),
    );
    expect(refundUpdates).toHaveLength(1);
    expect(refundUpdates[0]).toMatchObject({ status: "failed" });
    expect(String(refundUpdates[0].notes)).toMatch(/reverted/i);
    expect(exceptionInserts).toHaveLength(0);
  });

  it("when the revert fails: keeps the refund pending, annotates it and opens a reconciliation exception", async () => {
    const { supabase, refundUpdates, exceptionInserts } = makeSupabase({
      debitError: { message: "insufficient wallet balance" },
    });
    const result = await revertWalletRefundCreditAfterFinalizeFailure(supabase, baseParams);

    expect(result).toMatchObject({ reverted: false, error: "insufficient wallet balance" });
    // Never flips to failed/completed — the customer still holds the money.
    expect(refundUpdates).toHaveLength(1);
    expect(refundUpdates[0].status).toBeUndefined();
    expect(String(refundUpdates[0].notes)).toMatch(/manual reconciliation/i);
    expect(exceptionInserts).toHaveLength(1);
    expect(exceptionInserts[0]).toMatchObject({
      tenant_id: "tenant-1",
      external_id: "refund-1",
      internal_id: "booking-1",
      amount: 150,
      status: "open",
    });
    expect((exceptionInserts[0].metadata as Record<string, unknown>).kind).toBe(
      "wallet_refund_credit_unfinalised",
    );
  });
});
