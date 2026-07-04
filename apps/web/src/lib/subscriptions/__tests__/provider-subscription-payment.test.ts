import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn().mockResolvedValue("tenant-1"),
}));

vi.mock("@/lib/notifications/notify-provider-team", () => ({
  notifyProviderTeamUsers: vi.fn().mockResolvedValue(undefined),
}));

const disableSubscriptionByCode = vi.fn().mockResolvedValue({ data: {} });
vi.mock("@/lib/payments/paystack-complete", () => ({
  disableSubscriptionByCode: (...args: unknown[]) => disableSubscriptionByCode(...args),
}));

vi.mock("@/lib/subscriptions/ensure-provider-free-subscription", () => ({
  resolveCatalogPlanIdForProviderSubscription: vi.fn().mockResolvedValue("free-plan-1"),
}));

import {
  recordProviderSubscriptionPayment,
  reverseProviderSubscriptionPayment,
} from "../provider-subscription-payment";

type Row = Record<string, any>;

function matchContains(rowVal: unknown, obj: Row): boolean {
  if (!rowVal || typeof rowVal !== "object") return false;
  return Object.entries(obj).every(([k, v]) => (rowVal as Row)[k] === v);
}

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
        const stored = arr.map((r, i) => ({
          id: r.id ?? `${table}-ins-${(tables[table]?.length ?? 0) + i + 1}`,
          ...r,
        }));
        tables[table] = [...(tables[table] ?? []), ...stored];
        const first = stored[0] ?? null;
        const result = { data: null, error: null };
        // Chainable + thenable: supports both `await insert(...)` and
        // `await insert(...).select("id").single()`.
        return {
          select: () => ({
            single: async () => ({ data: first, error: null }),
            maybeSingle: async () => ({ data: first, error: null }),
          }),
          then: (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject),
          catch: (reject: (r: unknown) => unknown) => Promise.resolve(result).catch(reject),
        } as Row;
      },
    };
    return api;
  }

  return { supabase: { from: (t: string) => builder(t) } as never, tables, inserts };
}

describe("recordProviderSubscriptionPayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts one payment_transactions + finance_transactions (net of fees) keyed on reference", async () => {
    const db = makeDb({ payment_transactions: [], finance_transactions: [] });

    const result = await recordProviderSubscriptionPayment({
      supabase: db.supabase,
      reference: "ref-1",
      providerId: "prov-1",
      amountMajor: 300,
      feesMajor: 9,
      planId: "plan-growth",
      orderId: "order-1",
      kind: "provider_subscription_order",
    });

    expect(result.recorded).toBe(true);
    expect(result.alreadyRecorded).toBe(false);
    expect(result.netAmount).toBe(291);
    expect(result.financeTransactionId).toBeTruthy();
    expect(db.inserts.payment_transactions).toHaveLength(1);
    const finance = db.inserts.finance_transactions ?? [];
    expect(finance).toHaveLength(1);
    expect(finance[0].transaction_type).toBe("provider_subscription_payment");
    // `amount` is the GROSS charged (matches ads/marketing convention + the
    // provider receipt); `net` is gross − gateway fees (revenue recognition).
    expect(finance[0].amount).toBe(300);
    expect(finance[0].net).toBe(291);
    expect(finance[0].metadata.reference).toBe("ref-1");
    expect(finance[0].metadata.provider_subscription_order_id).toBe("order-1");
  });

  it("is idempotent — a duplicate reference does not double-post", async () => {
    const db = makeDb({ payment_transactions: [], finance_transactions: [] });

    await recordProviderSubscriptionPayment({
      supabase: db.supabase,
      reference: "ref-1",
      providerId: "prov-1",
      amountMajor: 300,
      feesMajor: 0,
      kind: "subscription_renewal",
    });
    const second = await recordProviderSubscriptionPayment({
      supabase: db.supabase,
      reference: "ref-1",
      providerId: "prov-1",
      amountMajor: 300,
      feesMajor: 0,
      kind: "subscription_renewal",
    });

    expect(second.alreadyRecorded).toBe(true);
    expect(db.inserts.payment_transactions).toHaveLength(1);
    expect(db.inserts.finance_transactions).toHaveLength(1);
  });
});

describe("reverseProviderSubscriptionPayment", () => {
  beforeEach(() => vi.clearAllMocks());

  function paidState() {
    return makeDb({
      finance_transactions: [
        {
          id: "fin-1",
          provider_id: "prov-1",
          transaction_type: "provider_subscription_payment",
          amount: 291,
          net: 291,
          metadata: { reference: "ref-1", provider_subscription_order_id: "order-1" },
        },
      ],
      provider_subscriptions: [
        {
          id: "sub-1",
          provider_id: "prov-1",
          tenant_id: "tenant-1",
          plan_id: "plan-growth",
          status: "active",
          paystack_subscription_code: "SUB_x",
        },
      ],
      provider_subscription_orders: [
        { id: "order-1", provider_id: "prov-1", status: "paid" },
      ],
    });
  }

  it("posts a full negative refund, falls to free, disables Paystack, marks order refunded", async () => {
    const db = paidState();

    const result = await reverseProviderSubscriptionPayment({
      supabase: db.supabase,
      reason: "paystack_refund",
      reference: "ref-1",
      orderId: "order-1",
    });

    expect(result.reversed).toBe(true);
    expect(result.ledgerReversed).toBe(true);
    expect(result.providerId).toBe("prov-1");

    const refunds = (db.inserts.finance_transactions ?? []).filter(
      (r) => r.transaction_type === "provider_subscription_refund",
    );
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toBe(-291);
    expect(refunds[0].net).toBe(-291);

    const sub = db.tables.provider_subscriptions[0];
    expect(sub.plan_id).toBe("free-plan-1");
    expect(sub.paystack_subscription_code).toBeNull();
    expect(db.tables.provider_subscription_orders[0].status).toBe("refunded");
    expect(disableSubscriptionByCode).toHaveBeenCalledWith("SUB_x", { tenantId: "tenant-1" });
  });

  it("is idempotent — a second reversal does not double-post", async () => {
    const db = paidState();

    await reverseProviderSubscriptionPayment({
      supabase: db.supabase,
      reason: "paystack_refund",
      reference: "ref-1",
      orderId: "order-1",
    });
    const second = await reverseProviderSubscriptionPayment({
      supabase: db.supabase,
      reason: "paystack_refund",
      reference: "ref-1",
      orderId: "order-1",
    });

    expect(second.alreadyReversed).toBe(true);
    const refunds = (db.inserts.finance_transactions ?? []).filter(
      (r) => r.transaction_type === "provider_subscription_refund",
    );
    expect(refunds).toHaveLength(1);
  });

  it("revokes access but posts no ledger when no revenue was recognized", async () => {
    const db = makeDb({
      finance_transactions: [],
      provider_subscriptions: [
        {
          id: "sub-1",
          provider_id: "prov-1",
          tenant_id: "tenant-1",
          plan_id: "plan-growth",
          status: "active",
          paystack_subscription_code: null,
        },
      ],
      provider_subscription_orders: [
        { id: "order-1", provider_id: "prov-1", status: "pending" },
      ],
    });

    const result = await reverseProviderSubscriptionPayment({
      supabase: db.supabase,
      reason: "paystack_refund",
      orderId: "order-1",
      providerIdHint: "prov-1",
    });

    expect(result.reversed).toBe(true);
    expect(result.ledgerReversed).toBe(false);
    expect(db.inserts.finance_transactions).toBeUndefined();
    expect(db.tables.provider_subscriptions[0].plan_id).toBe("free-plan-1");
  });
});
