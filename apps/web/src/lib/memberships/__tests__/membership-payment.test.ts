import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordMembershipPayment } from "../membership-payment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupabase(overrides?: {
  existingTx?: unknown;
  ptInsertError?: { code?: string; message?: string } | null;
  financeLegs?: string[];
}) {
  const existingTx = overrides?.existingTx ?? null;
  const ptInsertError = overrides?.ptInsertError ?? null;
  const financeLegs = overrides?.financeLegs ?? [];

  const insertMock = vi.fn().mockResolvedValue({ error: ptInsertError });
  const financeInserts: Array<Record<string, unknown>> = [];

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
          delete: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            contains: () => ({
              in: async () => ({
                data: financeLegs.map((transaction_type) => ({ transaction_type })),
                error: null,
              }),
            }),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          financeInserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }),
    _insertMock: insertMock,
    financeInserts,
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
    expect(supabase.financeInserts.map((row) => row.transaction_type)).toEqual([
      "membership_sale",
      "membership_provider_earnings",
    ]);
  });

  it("posts the missing sale and provider earnings when the payment was already saved", async () => {
    const supabase = makeSupabase({ existingTx: { id: "existing", status: "success" } });
    const result = await recordMembershipPayment({ supabase: supabase as any, ...baseParams });
    expect(result.recorded).toBe(false);
    expect(result.alreadyRecorded).toBe(true);
    expect(supabase._insertMock).not.toHaveBeenCalled();
    expect(supabase.financeInserts.map((row) => row.transaction_type)).toEqual([
      "membership_sale",
      "membership_provider_earnings",
    ]);
  });

  it("does not post the sale again when both finance rows are already saved", async () => {
    const supabase = makeSupabase({
      existingTx: { id: "existing", status: "success" },
      financeLegs: ["membership_sale", "membership_provider_earnings"],
    });
    const result = await recordMembershipPayment({ supabase: supabase as any, ...baseParams });
    expect(result.alreadyRecorded).toBe(true);
    expect(supabase.financeInserts).toHaveLength(0);
    expect(supabase._insertMock).not.toHaveBeenCalled();
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
