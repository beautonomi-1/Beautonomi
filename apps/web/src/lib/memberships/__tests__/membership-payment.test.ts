import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordMembershipPayment } from "../membership-payment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupabase(overrides?: {
  existingTx?: unknown;
  ptInsertError?: { code?: string; message?: string } | null;
}) {
  const existingTx = overrides?.existingTx ?? null;
  const ptInsertError = overrides?.ptInsertError ?? null;

  const insertMock = vi.fn().mockResolvedValue({ error: ptInsertError });

  return {
    from: vi.fn((table: string) => {
      if (table === "payment_transactions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: existingTx }),
              }),
            }),
          }),
          insert: insertMock,
        };
      }
      // finance_transactions: always succeed
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
    _insertMock: insertMock,
  };
}

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: async () => "tenant-1",
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recordMembershipPayment", () => {
  const baseParams = {
    reference: "ref_001",
    orderId: "order_001",
    userId: "user_001",
    providerId: "provider_001",
    planId: "plan_001",
    grossAmount: 200,
    feeAmount: 5.5,
    kind: "membership_order" as const,
  };

  it("records a new payment and returns recorded=true", async () => {
    const supabase = makeSupabase();
    const result = await recordMembershipPayment({ supabase: supabase as any, ...baseParams });
    expect(result.recorded).toBe(true);
    expect(result.alreadyRecorded).toBe(false);
    expect(result.netAmount).toBe(194.5);
    expect(supabase._insertMock).toHaveBeenCalledTimes(1);
  });

  it("returns alreadyRecorded=true when payment_transactions row already exists", async () => {
    const supabase = makeSupabase({ existingTx: { id: "existing" } });
    const result = await recordMembershipPayment({ supabase: supabase as any, ...baseParams });
    expect(result.recorded).toBe(false);
    expect(result.alreadyRecorded).toBe(true);
    expect(supabase._insertMock).not.toHaveBeenCalled();
  });

  it("returns alreadyRecorded=true on 23505 unique violation from insert", async () => {
    const supabase = makeSupabase({ ptInsertError: { code: "23505", message: "duplicate" } });
    const result = await recordMembershipPayment({ supabase: supabase as any, ...baseParams });
    expect(result.recorded).toBe(false);
    expect(result.alreadyRecorded).toBe(true);
  });

  it("returns recorded=false for missing reference", async () => {
    const supabase = makeSupabase();
    const result = await recordMembershipPayment({
      supabase: supabase as any,
      ...baseParams,
      reference: "",
    });
    expect(result.recorded).toBe(false);
    expect(result.alreadyRecorded).toBe(false);
  });

  it("returns recorded=false for missing providerId", async () => {
    const supabase = makeSupabase();
    const result = await recordMembershipPayment({
      supabase: supabase as any,
      ...baseParams,
      providerId: "",
    });
    expect(result.recorded).toBe(false);
    expect(result.alreadyRecorded).toBe(false);
  });
});
