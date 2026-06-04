import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordProductOrderPayment } from "../record-product-order-payment";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn().mockResolvedValue("tenant-1"),
}));

vi.mock("@/lib/orders/product-order-lifecycle", () => ({
  clearCustomerCartForProvider: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/orders/ensure-package-entitlements-from-product-order", () => ({
  ensurePackageEntitlementsFromProductOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/orders/shipping", () => ({
  bookShippingForOrder: vi.fn().mockResolvedValue({ ok: true, skipped: "no_shipping_preference" }),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

type Row = Record<string, unknown>;

function makeQuery(table: string, state: { rows: Record<string, Row[]>; inserts: Record<string, Row[][]>; updates: Record<string, Row[]> }) {
  const filters: Array<{ key: string; value: unknown; op: "eq" | "ilike" }> = [];
  const applyFilters = (rows: Row[]) =>
    rows.filter((row) =>
      filters.every((filter) => {
        if (filter.op === "ilike") {
          const needle = String(filter.value).replaceAll("%", "").toLowerCase();
          return String(row[filter.key] ?? "").toLowerCase().includes(needle);
        }
        return row[filter.key] === filter.value;
      }),
    );

  const query = {
    select: vi.fn(() => query),
    eq(key: string, value: unknown) {
      filters.push({ key, value, op: "eq" });
      return query;
    },
    ilike(key: string, value: unknown) {
      filters.push({ key, value, op: "ilike" });
      return query;
    },
    maybeSingle: vi.fn(async () => ({
      data: applyFilters(state.rows[table] ?? [])[0] ?? null,
      error: null,
    })),
    update(payload: Row) {
      state.updates[table] = [...(state.updates[table] ?? []), payload];
      return {
        eq: vi.fn(async () => ({ data: null, error: null })),
      };
    },
    insert(payload: Row | Row[]) {
      state.inserts[table] = [...(state.inserts[table] ?? []), Array.isArray(payload) ? payload : [payload]];
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: applyFilters(state.rows[table] ?? []), error: null }).then(resolve, reject);
    },
  };
  return query;
}

function mockSupabase(rows: Record<string, Row[]>) {
  const state = { rows, inserts: {} as Record<string, Row[][]>, updates: {} as Record<string, Row[]> };
  const supabase = {
    from: vi.fn((table: string) => makeQuery(table, state)),
  };
  return { supabase: supabase as never, state };
}

const orderRow = {
  id: "order-1",
  tenant_id: "tenant-1",
  provider_id: "provider-1",
  customer_id: "customer-1",
  order_number: "BO-1",
  total_amount: 100,
  platform_fee: 10,
  payment_status: "pending",
  payment_reference: null,
  status: "pending",
};

describe("recordProductOrderPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records provider-collected product payments without finance_transactions payout rows", async () => {
    const { supabase, state } = mockSupabase({
      product_orders: [orderRow],
      payment_transactions: [],
      finance_transactions: [],
    });

    const result = await recordProductOrderPayment({
      supabase,
      productOrderId: "order-1",
      reference: "cash-order-1",
      amountMajor: 100,
      source: "provider_mark_collected",
      provider: "cash",
      platformHeld: false,
    });

    expect(result).toEqual({ ok: true, duplicate: false, transitionedToPaid: true });
    expect(state.inserts.payment_transactions).toHaveLength(1);
    expect(state.inserts.finance_transactions).toBeUndefined();
  });

  it("recovers missing platform-held product ledger rows when payment transaction already exists", async () => {
    const { supabase, state } = mockSupabase({
      product_orders: [{ ...orderRow, payment_status: "paid", payment_reference: "paystack-ref" }],
      payment_transactions: [{ id: "tx-1", provider: "paystack", reference: "paystack-ref" }],
      finance_transactions: [],
    });

    const result = await recordProductOrderPayment({
      supabase,
      productOrderId: "order-1",
      reference: "paystack-ref",
      amountMajor: 100,
      feesMajor: 2,
      source: "paystack_verify",
      provider: "paystack",
    });

    expect(result).toEqual({ ok: true, duplicate: false, transitionedToPaid: false });
    expect(state.inserts.payment_transactions).toBeUndefined();
    expect(state.inserts.finance_transactions?.[0].map((row) => row.transaction_type)).toEqual([
      "payment",
      "provider_earnings",
      "platform_fee",
    ]);
    expect(state.inserts.finance_transactions?.[0].every((row) => row.product_order_id === "order-1")).toBe(true);
  });

  it("treats platform-held product payments as duplicate when product-order ledger rows already exist", async () => {
    const { supabase, state } = mockSupabase({
      product_orders: [{ ...orderRow, payment_status: "paid", payment_reference: "paystack-ref" }],
      payment_transactions: [{ id: "tx-1", provider: "paystack", reference: "paystack-ref" }],
      finance_transactions: [
        {
          id: "ledger-1",
          provider_id: "provider-1",
          product_order_id: "order-1",
          transaction_type: "provider_earnings",
          description: "legacy description without order number",
        },
      ],
    });

    const result = await recordProductOrderPayment({
      supabase,
      productOrderId: "order-1",
      reference: "paystack-ref",
      amountMajor: 100,
      feesMajor: 2,
      source: "paystack_webhook",
      provider: "paystack",
    });

    expect(result).toEqual({ ok: true, duplicate: true, transitionedToPaid: false });
    expect(state.inserts.finance_transactions).toBeUndefined();
  });
});
