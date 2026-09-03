import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Part C1: consuming PURCHASED marketing credit must release the deferred
 * liability by posting a `marketing_credit_recognition` finance row, exactly
 * once per credit-ledger idempotency key; consuming the free included grant
 * must not recognize anything.
 */

type Row = Record<string, unknown>;

const state = {
  financeRows: [] as Row[],
  creditLedger: [] as Row[],
  balance: { included_balance_zar: 0, purchased_balance_zar: 0 },
  rpcResult: null as null | { ok: boolean; balance_after?: number; from_purchased?: number; reason?: string },
  rpcCalls: 0,
};

function matchesContains(row: Row, filter: Record<string, unknown>) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return Object.entries(filter).every(([k, v]) => meta[k] === v);
}

function query(rows: Row[]) {
  const build = (filtered: Row[]) => {
    const chain: any = {
      eq: (col: string, val: unknown) => build(filtered.filter((r) => r[col] === val)),
      contains: (_col: string, filter: Record<string, unknown>) =>
        build(filtered.filter((r) => matchesContains(r, filter))),
      maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
      single: async () => ({ data: filtered[0] ?? null, error: filtered[0] ? null : { message: "not found" } }),
    };
    return chain;
  };
  return build(rows);
}

const mockAdmin = {
  from: (table: string) => {
    if (table === "finance_transactions") {
      return {
        select: () => query(state.financeRows),
        insert: async (row: Row) => {
          state.financeRows.push({ id: `ft-${state.financeRows.length + 1}`, ...row });
          return { error: null };
        },
      };
    }
    if (table === "marketing_credit_ledger") {
      return {
        select: () => query(state.creditLedger),
        insert: async (row: Row) => {
          state.creditLedger.push({ id: `mcl-${state.creditLedger.length + 1}`, ...row });
          return { error: null };
        },
      };
    }
    if (table === "provider_marketing_credits") {
      return {
        select: () => query([{ provider_id: "prov-1", ...state.balance }]),
        insert: async () => ({ error: null }),
        update: (payload: Partial<typeof state.balance>) => ({
          eq: async () => {
            Object.assign(state.balance, payload);
            return { error: null };
          },
        }),
      };
    }
    if (table === "providers") {
      return { select: () => query([{ id: "prov-1", tenant_id: "tenant-1" }]) };
    }
    if (table === "tenants") {
      return { select: () => query([{ id: "tenant-1", default_currency: "ZAR" }]) };
    }
    throw new Error(`unexpected table ${table}`);
  },
  rpc: async (fn: string) => {
    if (fn !== "debit_marketing_credit") return { data: null, error: null };
    state.rpcCalls += 1;
    if (state.rpcResult === null) {
      return { data: null, error: { code: "42883", message: "function does not exist" } };
    }
    return { data: state.rpcResult, error: null };
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockAdmin,
}));

import { debitMarketingBalance, recognizeMarketingCreditConsumption } from "../credits";

function recognitionRows() {
  return state.financeRows.filter((r) => r.transaction_type === "marketing_credit_recognition");
}

describe("marketing credit consumption recognition", () => {
  beforeEach(() => {
    state.financeRows = [];
    state.creditLedger = [];
    state.balance = { included_balance_zar: 0, purchased_balance_zar: 0 };
    state.rpcResult = null;
    state.rpcCalls = 0;
  });

  it("is idempotent on the credit idempotency key", async () => {
    const supabase = mockAdmin as any;
    const first = await recognizeMarketingCreditConsumption(supabase, {
      providerId: "prov-1",
      idempotencyKey: "campaign_send:c1:r1",
      consumedPurchasedZar: 1.5,
      reason: "campaign_send",
    });
    const second = await recognizeMarketingCreditConsumption(supabase, {
      providerId: "prov-1",
      idempotencyKey: "campaign_send:c1:r1",
      consumedPurchasedZar: 1.5,
      reason: "campaign_send",
    });

    expect(first).toEqual({ recorded: true, alreadyRecorded: false, amountZar: 1.5 });
    expect(second).toEqual({ recorded: false, alreadyRecorded: true, amountZar: 1.5 });
    const rows = recognitionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider_id: "prov-1",
      tenant_id: "tenant-1",
      amount: 1.5,
      net: 1.5,
      commission: 0,
      fees: 0,
      currency: "ZAR",
    });
    expect((rows[0].metadata as Row).idempotency_key).toBe("campaign_send:c1:r1");
    expect((rows[0].metadata as Row).reason).toBe("campaign_send");
  });

  it("does nothing for a zero purchased portion", async () => {
    const result = await recognizeMarketingCreditConsumption(mockAdmin as any, {
      providerId: "prov-1",
      idempotencyKey: "k",
      consumedPurchasedZar: 0,
      reason: "campaign_send",
    });
    expect(result.recorded).toBe(false);
    expect(recognitionRows()).toHaveLength(0);
  });

  it("recognizes only the purchased portion when the debit spans included + purchased (fallback path)", async () => {
    // RPC missing -> app fallback: included drawn first.
    state.balance = { included_balance_zar: 2, purchased_balance_zar: 10 };
    const debit = await debitMarketingBalance({
      providerId: "prov-1",
      amountZar: 5,
      reason: "campaign_send",
      idempotencyKey: "campaign_send:c2:r1",
    });
    expect(debit.ok).toBe(true);
    const rows = recognitionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(3);
    expect(rows[0].net).toBe(3);
  });

  it("does not recognize when only the free included grant is consumed", async () => {
    state.balance = { included_balance_zar: 20, purchased_balance_zar: 10 };
    const debit = await debitMarketingBalance({
      providerId: "prov-1",
      amountZar: 5,
      reason: "automation_send",
      idempotencyKey: "automation_send:a1:r1",
    });
    expect(debit.ok).toBe(true);
    expect(recognitionRows()).toHaveLength(0);
  });

  it("prefers the exact from_purchased split returned by the RPC (migration 870)", async () => {
    state.balance = { included_balance_zar: 0, purchased_balance_zar: 100 };
    state.rpcResult = { ok: true, balance_after: 96, from_purchased: 4 };
    const debit = await debitMarketingBalance({
      providerId: "prov-1",
      amountZar: 4,
      reason: "campaign_send",
      idempotencyKey: "campaign_send:c3:r1",
    });
    expect(debit.ok).toBe(true);
    expect(state.rpcCalls).toBe(1);
    const rows = recognitionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(4);
  });

  it("does not recognize on refund-type debits and does not recognize a failed debit", async () => {
    state.balance = { included_balance_zar: 0, purchased_balance_zar: 1 };
    const insufficient = await debitMarketingBalance({
      providerId: "prov-1",
      amountZar: 5,
      reason: "campaign_send",
      idempotencyKey: "campaign_send:c4:r1",
    });
    expect(insufficient.ok).toBe(false);
    expect(recognitionRows()).toHaveLength(0);

    state.balance = { included_balance_zar: 0, purchased_balance_zar: 10 };
    const refundDebit = await debitMarketingBalance({
      providerId: "prov-1",
      amountZar: 5,
      reason: "refund",
      idempotencyKey: "refund:x",
    });
    expect(refundDebit.ok).toBe(true);
    expect(recognitionRows()).toHaveLength(0);
  });
});
