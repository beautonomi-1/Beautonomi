import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn().mockResolvedValue("tenant-1"),
}));

vi.mock("@/lib/notifications/notify-provider-team", () => ({
  notifyProviderTeamUsers: vi.fn().mockResolvedValue(undefined),
}));

import {
  recordAdsBudgetOrderPayment,
  reverseAdsBudgetOrderPayment,
} from "../ads-budget-order-payment";

type Row = Record<string, any>;

function matchContains(rowVal: unknown, obj: Row): boolean {
  if (!rowVal || typeof rowVal !== "object") return false;
  return Object.entries(obj).every(([k, v]) => (rowVal as Row)[k] === v);
}

/**
 * Minimal mutable in-memory Supabase double covering the fluent calls the ads
 * payment helper makes: select/eq/contains/single/maybeSingle, update().eq()…,
 * and insert (which appends so idempotency re-reads see the new state).
 */
function makeDb(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const k of Object.keys(initial)) tables[k] = initial[k].map((r) => ({ ...r }));
  const inserts: Record<string, Row[]> = {};

  function builder(table: string) {
    const filters: Array<{ k: string; v: unknown; op: "eq" | "contains" }> = [];
    const apply = () =>
      (tables[table] ?? []).filter((row) =>
        filters.every((f) =>
          f.op === "eq" ? row[f.k] === f.v : matchContains(row[f.k], f.v as Row),
        ),
      );
    const api: Row = {
      select: () => api,
      eq: (k: string, v: unknown) => {
        filters.push({ k, v, op: "eq" });
        return api;
      },
      contains: (k: string, v: unknown) => {
        filters.push({ k, v, op: "contains" });
        return api;
      },
      single: async () => {
        const row = apply()[0] ?? null;
        return { data: row, error: row ? null : { message: "not found" } };
      },
      maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
      update: (payload: Row) => {
        const upd: Row = {
          eq: (k: string, v: unknown) => {
            filters.push({ k, v, op: "eq" });
            return upd;
          },
          then: (resolve: (value: unknown) => unknown, reject?: (r: unknown) => unknown) => {
            const matched = apply();
            matched.forEach((row) => Object.assign(row, payload));
            return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
          },
        };
        return upd;
      },
      insert: (payload: Row | Row[]) => {
        const arr = Array.isArray(payload) ? payload : [payload];
        inserts[table] = [...(inserts[table] ?? []), ...arr];
        tables[table] = [...(tables[table] ?? []), ...arr.map((r) => ({ ...r }))];
        return Promise.resolve({ data: null, error: null });
      },
    };
    return api;
  }

  return { supabase: { from: (t: string) => builder(t) } as never, tables, inserts };
}

const baseOrder = {
  id: "order-1",
  amount: 500,
  status: "pending",
  campaign_id: "camp-1",
  provider_id: "prov-1",
  currency: "ZAR",
  paystack_reference: null,
};

const baseCampaign = {
  id: "camp-1",
  provider_id: "prov-1",
  billing_model: "cpc_budget",
  duration_days: null,
  budget: 0,
  status: "draft",
  funded_at: null,
  paid_order_id: null,
};

describe("recordAdsBudgetOrderPayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("funds + activates the campaign and posts the revenue ledger", async () => {
    const db = makeDb({
      ads_budget_orders: [{ ...baseOrder }],
      ads_campaigns: [{ ...baseCampaign }],
      payment_transactions: [],
      finance_transactions: [],
    });

    const result = await recordAdsBudgetOrderPayment({
      supabase: db.supabase,
      orderId: "order-1",
      reference: "ref-1",
      amountMajor: 500,
      feesMajor: 10,
    });

    expect(result.finalized).toBe(true);
    const order = db.tables.ads_budget_orders[0];
    expect(order.status).toBe("paid");
    const campaign = db.tables.ads_campaigns[0];
    expect(campaign.status).toBe("active");
    expect(campaign.funded_at).toBeTruthy();
    expect(campaign.paid_order_id).toBe("order-1");
    expect(db.inserts.payment_transactions).toHaveLength(1);
    const finance = db.inserts.finance_transactions ?? [];
    expect(finance).toHaveLength(1);
    expect(finance[0].transaction_type).toBe("provider_ads_payment");
    expect(finance[0].amount).toBe(500);
    expect(finance[0].net).toBe(0);
    expect(finance[0].metadata.ads_budget_order_id).toBe("order-1");
  });

  it("is idempotent — a second finalize does not double-post", async () => {
    const db = makeDb({
      ads_budget_orders: [{ ...baseOrder }],
      ads_campaigns: [{ ...baseCampaign }],
      payment_transactions: [],
      finance_transactions: [],
    });

    await recordAdsBudgetOrderPayment({
      supabase: db.supabase,
      orderId: "order-1",
      reference: "ref-1",
      amountMajor: 500,
      feesMajor: 10,
    });
    const second = await recordAdsBudgetOrderPayment({
      supabase: db.supabase,
      orderId: "order-1",
      reference: "ref-1",
      amountMajor: 500,
      feesMajor: 10,
    });

    expect(second.alreadyPaid).toBe(true);
    expect(db.inserts.payment_transactions).toHaveLength(1);
    expect(db.inserts.finance_transactions).toHaveLength(1);
  });

  it("refuses to fund when the charged amount does not match the order", async () => {
    const db = makeDb({
      ads_budget_orders: [{ ...baseOrder }],
      ads_campaigns: [{ ...baseCampaign }],
      payment_transactions: [],
      finance_transactions: [],
    });

    const result = await recordAdsBudgetOrderPayment({
      supabase: db.supabase,
      orderId: "order-1",
      reference: "ref-1",
      amountMajor: 50, // mismatch
      feesMajor: 1,
    });

    expect(result.finalized).toBe(false);
    expect(db.tables.ads_budget_orders[0].status).toBe("pending");
    expect(db.tables.ads_campaigns[0].status).toBe("draft");
    expect(db.inserts.finance_transactions).toBeUndefined();
  });

  it("sets an end window for time-based boosts", async () => {
    const db = makeDb({
      ads_budget_orders: [{ ...baseOrder, amount: 300 }],
      ads_campaigns: [
        { ...baseCampaign, billing_model: "time_based", duration_days: 7 },
      ],
      payment_transactions: [],
      finance_transactions: [],
    });

    await recordAdsBudgetOrderPayment({
      supabase: db.supabase,
      orderId: "order-1",
      reference: "ref-1",
      amountMajor: 300,
      feesMajor: 0,
    });

    const campaign = db.tables.ads_campaigns[0];
    expect(campaign.status).toBe("active");
    expect(campaign.funded_at).toBeTruthy();
    expect(campaign.end_at).toBeTruthy();
  });
});

describe("reverseAdsBudgetOrderPayment", () => {
  beforeEach(() => vi.clearAllMocks());

  function paidState() {
    return makeDb({
      ads_budget_orders: [{ ...baseOrder, status: "paid", budget: 500 }],
      ads_campaigns: [
        {
          ...baseCampaign,
          status: "active",
          budget: 500,
          funded_at: "2026-01-01T00:00:00.000Z",
          paid_order_id: "order-1",
        },
      ],
      finance_transactions: [],
    });
  }

  it("stops serving and fully reverses a paid order (refund)", async () => {
    const db = paidState();

    const result = await reverseAdsBudgetOrderPayment({
      supabase: db.supabase,
      orderId: "order-1",
      finalOrderStatus: "refunded",
      reason: "paystack_refund",
    });

    expect(result.reversed).toBe(true);
    expect(result.ledgerReversed).toBe(true);
    const campaign = db.tables.ads_campaigns[0];
    expect(campaign.status).toBe("ended");
    expect(campaign.funded_at).toBeNull();
    expect(campaign.paid_order_id).toBeNull();
    expect(db.tables.ads_budget_orders[0].status).toBe("refunded");
    const finance = db.inserts.finance_transactions ?? [];
    expect(finance).toHaveLength(1);
    expect(finance[0].transaction_type).toBe("provider_ads_refund");
    expect(finance[0].amount).toBe(-500);
  });

  it("is idempotent — a second reversal does not double-post", async () => {
    const db = paidState();

    await reverseAdsBudgetOrderPayment({
      supabase: db.supabase,
      orderId: "order-1",
      finalOrderStatus: "refunded",
      reason: "paystack_refund",
    });
    const second = await reverseAdsBudgetOrderPayment({
      supabase: db.supabase,
      orderId: "order-1",
      finalOrderStatus: "refunded",
      reason: "paystack_refund",
    });

    expect(second.alreadyReversed).toBe(true);
    expect(db.inserts.finance_transactions ?? []).toHaveLength(1);
  });

  it("handles the success-then-failed race (paid then charge.failed)", async () => {
    const db = paidState();

    const result = await reverseAdsBudgetOrderPayment({
      supabase: db.supabase,
      orderId: "order-1",
      finalOrderStatus: "failed",
      reason: "charge_failed",
    });

    expect(result.ledgerReversed).toBe(true);
    expect(db.tables.ads_campaigns[0].status).toBe("ended");
    expect(db.tables.ads_budget_orders[0].status).toBe("failed");
    expect((db.inserts.finance_transactions ?? [])[0].transaction_type).toBe(
      "provider_ads_refund",
    );
  });

  it("marks a never-paid order failed without posting any reversal ledger", async () => {
    const db = makeDb({
      ads_budget_orders: [{ ...baseOrder, status: "pending" }],
      ads_campaigns: [{ ...baseCampaign }],
      finance_transactions: [],
    });

    const result = await reverseAdsBudgetOrderPayment({
      supabase: db.supabase,
      orderId: "order-1",
      finalOrderStatus: "failed",
      reason: "charge_failed",
    });

    expect(result.reversed).toBe(true);
    expect(result.ledgerReversed).toBe(false);
    expect(db.tables.ads_budget_orders[0].status).toBe("failed");
    // Unfunded draft is left intact so the provider can retry payment.
    expect(db.tables.ads_campaigns[0].status).toBe("draft");
    expect(db.inserts.finance_transactions).toBeUndefined();
  });
});
