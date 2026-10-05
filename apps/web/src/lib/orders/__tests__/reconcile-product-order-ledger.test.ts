import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRecord = vi.fn();

vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: (...args: unknown[]) => mockRecord(...args),
}));

vi.mock("@/lib/integrations/slack/dispatch", () => ({
  tryNotifySlackEvent: vi.fn(async () => undefined),
}));

import { reconcileProductOrderLedger } from "../reconcile-product-order-ledger";

type Row = Record<string, unknown>;

function makeSupabase(initial: Record<string, Row[]>) {
  const stores: Record<string, Row[]> = { reconciliation_exceptions: [], ...initial };

  class Query {
    private filters: Array<{ col: string; op: string; val: unknown }> = [];
    private patch: Row = {};
    private mode: "select" | "update" = "select";
    private limitN: number | null = null;
    private orderAsc = false;

    constructor(private table: string) {}

    select() {
      return this;
    }
    update(patch: Row) {
      this.mode = "update";
      this.patch = patch;
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push({ col, op: "eq", val });
      return this;
    }
    in(col: string, val: unknown[]) {
      this.filters.push({ col, op: "in", val });
      return this;
    }
    lt(col: string, val: unknown) {
      this.filters.push({ col, op: "lt", val });
      return this;
    }
    is(col: string, val: unknown) {
      this.filters.push({ col, op: "is", val });
      return this;
    }
    ilike(col: string, val: unknown) {
      this.filters.push({ col, op: "ilike", val });
      return this;
    }
    or() {
      return this;
    }
    order(_col: string, opts: { ascending: boolean }) {
      this.orderAsc = opts.ascending;
      return this;
    }
    limit(n: number) {
      this.limitN = n;
      return this;
    }

    private match(): Row[] {
      let rows = [...(stores[this.table] ?? [])];
      for (const f of this.filters) {
        if (f.op === "eq") rows = rows.filter((r) => r[f.col] === f.val);
        else if (f.op === "in") rows = rows.filter((r) => (f.val as unknown[]).includes(r[f.col]));
        else if (f.op === "lt") rows = rows.filter((r) => String(r[f.col]) < String(f.val));
        else if (f.op === "is") rows = rows.filter((r) => (f.val === null ? r[f.col] == null : r[f.col] === f.val));
        else if (f.op === "ilike") {
          const needle = String(f.val).replaceAll("%", "").toLowerCase();
          rows = rows.filter((r) => String(r[f.col] ?? "").toLowerCase().includes(needle));
        }
      }
      if (this.orderAsc) {
        rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      return rows;
    }

    then(resolve: (v: { data: Row[]; error: null }) => unknown) {
      if (this.mode === "update") {
        const matched = this.match();
        for (const row of matched) Object.assign(row, this.patch);
        return Promise.resolve({ data: matched, error: null }).then(resolve);
      }
      return Promise.resolve({ data: this.match(), error: null }).then(resolve);
    }
  }

  return {
    supabase: { from: (table: string) => new Query(table) } as never,
    stores,
  };
}

describe("reconcileProductOrderLedger", () => {
  beforeEach(() => {
    mockRecord.mockReset();
  });

  it("skips orders that already have provider_earnings", async () => {
    const { supabase } = makeSupabase({
      product_orders: [
        {
          id: "order-1",
          tenant_id: "t1",
          provider_id: "p1",
          order_number: "BO-1",
          payment_method: "wallet",
          payment_status: "paid",
          created_at: "2020-01-01T00:00:00.000Z",
        },
      ],
      finance_transactions: [
        {
          id: "ft-1",
          product_order_id: "order-1",
          transaction_type: "provider_earnings",
          provider_id: "p1",
        },
      ],
    });

    const summary = await reconcileProductOrderLedger(supabase, {
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(summary.skipped).toBe(1);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("repairs missing ledger via recordProductOrderPayment", async () => {
    const { supabase } = makeSupabase({
      product_orders: [
        {
          id: "order-2",
          tenant_id: "t1",
          provider_id: "p1",
          order_number: "BO-2",
          payment_method: "wallet",
          payment_status: "paid",
          payment_reference: "wallet_product_order_order-2",
          total_amount: 50,
          paid_at: "2026-07-22T13:08:59.661Z",
          created_at: "2026-07-22T13:00:00.000Z",
        },
      ],
      finance_transactions: [],
      payment_transactions: [],
    });

    mockRecord.mockResolvedValue({ ok: true, duplicate: false, transitionedToPaid: false });

    const summary = await reconcileProductOrderLedger(supabase, {
      now: new Date("2026-08-01T00:00:00.000Z"),
    });

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        productOrderId: "order-2",
        skipSideEffects: true,
        ledgerCreatedAt: "2026-07-22T13:08:59.661Z",
      }),
    );
  });
});
