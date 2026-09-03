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

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn().mockResolvedValue({ defaultCurrency: "ZAR" }),
}));

const platformTaxRate = { value: 0 };
vi.mock("@/lib/platform-tax-settings", () => ({
  getPlatformDefaultTaxRate: vi.fn(async () => platformTaxRate.value),
}));

import {
  recordProviderSubscriptionPayment,
  reverseProviderSubscriptionPayment,
  splitSubscriptionRefundComponents,
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
      // Awaiting a bare select chain returns the full filtered list.
      then: (resolve: (value: unknown) => unknown, reject?: (r: unknown) => unknown) =>
        Promise.resolve({ data: apply(), error: null }).then(resolve, reject),
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

  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: async () => ({ data: 0, error: null }),
    } as never,
    tables,
    inserts,
  };
}

describe("recordProviderSubscriptionPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformTaxRate.value = 0;
  });

  it("posts a separate VAT `tax` leg (amount = VAT portion, net 0) when the platform VAT rate is set", async () => {
    platformTaxRate.value = 15;
    const db = makeDb({ payment_transactions: [], finance_transactions: [] });

    const result = await recordProviderSubscriptionPayment({
      supabase: db.supabase,
      reference: "ref-vat",
      providerId: "prov-1",
      amountMajor: 345,
      feesMajor: 0,
      kind: "subscription_renewal",
    });

    expect(result.recorded).toBe(true);
    const finance = db.inserts.finance_transactions ?? [];
    const payment = finance.find((r) => r.transaction_type === "provider_subscription_payment");
    const tax = finance.filter((r) => r.transaction_type === "tax");
    expect(payment.amount).toBe(345);
    expect(payment.metadata.vat_amount).toBe(45);
    expect(tax).toHaveLength(1);
    expect(tax[0].amount).toBe(45);
    expect(tax[0].net).toBe(0);
    expect(tax[0].booking_id).toBeNull();
    expect(tax[0].metadata.vat_source).toBe("provider_subscription_payment");
    expect(tax[0].metadata.source_payment_id).toBe(result.financeTransactionId);
    expect(tax[0].metadata.vat_rate_percent).toBe(15);
  });

  it("posts no VAT leg when the platform VAT rate is 0", async () => {
    const db = makeDb({ payment_transactions: [], finance_transactions: [] });
    await recordProviderSubscriptionPayment({
      supabase: db.supabase,
      reference: "ref-novat",
      providerId: "prov-1",
      amountMajor: 300,
      feesMajor: 0,
      kind: "subscription_renewal",
    });
    const finance = db.inserts.finance_transactions ?? [];
    expect(finance.filter((r) => r.transaction_type === "tax")).toHaveLength(0);
  });

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
    expect(finance[0].net).toBe(0);
    expect(finance[0].fees).toBe(9);
    expect(finance[0].metadata.recognition_basis).toBe("term");
    expect(finance[0].metadata.reference).toBe("ref-1");
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

  it("reverses deferred payments using gross amount when net is zero", async () => {
    const db = makeDb({
      finance_transactions: [
        {
          id: "fin-1",
          provider_id: "prov-1",
          transaction_type: "provider_subscription_payment",
          amount: 300,
          net: 0,
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

    const result = await reverseProviderSubscriptionPayment({
      supabase: db.supabase,
      reason: "paystack_refund",
      reference: "ref-1",
      orderId: "order-1",
    });

    expect(result.ledgerReversed).toBe(true);
    const refunds = (db.inserts.finance_transactions ?? []).filter(
      (r) => r.transaction_type === "provider_subscription_refund",
    );
    expect(refunds[0].amount).toBe(-300);
  });

  it("splits the refund into deferred vs already-recognized components and reverses the VAT leg", async () => {
    const db = makeDb({
      finance_transactions: [
        {
          id: "fin-1",
          provider_id: "prov-1",
          transaction_type: "provider_subscription_payment",
          amount: 345,
          net: 0,
          currency: "ZAR",
          metadata: {
            reference: "ref-1",
            provider_subscription_order_id: "order-1",
            vat_amount: 45,
            vat_rate_percent: 15,
          },
        },
        {
          id: "tax-1",
          provider_id: "prov-1",
          transaction_type: "tax",
          amount: 45,
          net: 0,
          metadata: { vat_source: "provider_subscription_payment", source_payment_id: "fin-1" },
        },
        // Two daily recognition rows already moved 100 to revenue.
        {
          id: "rec-1",
          provider_id: "prov-1",
          transaction_type: "subscription_recognition",
          amount: 60,
          net: 60,
          metadata: { source_payment_id: "fin-1" },
        },
        {
          id: "rec-2",
          provider_id: "prov-1",
          transaction_type: "subscription_recognition",
          amount: 40,
          net: 40,
          metadata: { source_payment_id: "fin-1" },
        },
        // Recognition for a different payment must not count.
        {
          id: "rec-other",
          provider_id: "prov-1",
          transaction_type: "subscription_recognition",
          amount: 999,
          net: 999,
          metadata: { source_payment_id: "fin-other" },
        },
      ],
      provider_subscriptions: [
        { id: "sub-1", provider_id: "prov-1", tenant_id: "tenant-1", plan_id: "plan-growth", status: "active", paystack_subscription_code: null },
      ],
      provider_subscription_orders: [{ id: "order-1", provider_id: "prov-1", status: "paid" }],
    });

    const result = await reverseProviderSubscriptionPayment({
      supabase: db.supabase,
      reason: "paystack_refund",
      reference: "ref-1",
      orderId: "order-1",
    });

    expect(result.ledgerReversed).toBe(true);
    const inserted = db.inserts.finance_transactions ?? [];
    const refund = inserted.find((r) => r.transaction_type === "provider_subscription_refund");
    expect(refund.amount).toBe(-345);
    expect(refund.currency).toBe("ZAR");
    expect(refund.metadata.source_payment_id).toBe("fin-1");
    expect(refund.metadata.recognized_reversed).toBe(100);
    expect(refund.metadata.deferred_reversed).toBe(245);

    const taxLegs = inserted.filter((r) => r.transaction_type === "tax");
    expect(taxLegs).toHaveLength(1);
    expect(taxLegs[0].amount).toBe(-45);
    expect(taxLegs[0].net).toBe(0);
    expect(taxLegs[0].metadata.vat_source).toBe("provider_subscription_refund");
    expect(taxLegs[0].metadata.source_payment_id).toBe("fin-1");
  });

  it("splitSubscriptionRefundComponents clamps recognized to the reversal amount", () => {
    expect(splitSubscriptionRefundComponents(300, 0)).toEqual({ deferred_reversed: 300, recognized_reversed: 0 });
    expect(splitSubscriptionRefundComponents(300, 120.555)).toEqual({ deferred_reversed: 179.44, recognized_reversed: 120.56 });
    expect(splitSubscriptionRefundComponents(300, 900)).toEqual({ deferred_reversed: 0, recognized_reversed: 300 });
    expect(splitSubscriptionRefundComponents(0, 50)).toEqual({ deferred_reversed: 0, recognized_reversed: 0 });
  });

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
