import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: vi.fn(async () => true),
}));

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

const finalizeTerminalOrderAfterPayment = vi.fn(async () => undefined);
vi.mock("@/lib/terminal/finalize-terminal-order-after-payment", () => ({
  finalizeTerminalOrderAfterPayment: (...args: unknown[]) => finalizeTerminalOrderAfterPayment(...args),
}));

import { recordTerminalOrderPayment } from "../record-terminal-order-payment";

type Row = Record<string, unknown>;

function makeDb(order: Row, options?: { finance?: Row[] }) {
  const finance = [...(options?.finance ?? [])];
  const inserts = { payment_transactions: [] as Row[], finance_transactions: [] as Row[] };
  const orderUpdates: Row[] = [];
  let currentOrder = { ...order };

  function financeChain() {
    const filters: Array<(row: Row) => boolean> = [];
    const api = {
      select: () => api,
      eq: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return api;
      },
      contains: (key: string, value: Row) => {
        filters.push((row) => {
          const meta = row[key];
          if (!meta || typeof meta !== "object") return false;
          return Object.entries(value).every(([k, v]) => (meta as Row)[k] === v);
        });
        return api;
      },
      maybeSingle: async () => ({
        data: finance.find((row) => filters.every((fn) => fn(row))) ?? null,
        error: null,
      }),
      insert: (row: Row) => {
        inserts.finance_transactions.push(row);
        const stored = { id: "fin-new", ...row };
        finance.push(stored);
        return {
          select: () => ({
            single: async () => ({ data: stored, error: null }),
          }),
        };
      },
    };
    return api;
  }

  return {
    supabase: {
      from: (table: string) => {
        if (table === "terminal_orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: currentOrder, error: null }),
              }),
            }),
            update: (payload: Row) => ({
              eq: async () => {
                orderUpdates.push(payload);
                currentOrder = { ...currentOrder, ...payload };
                return { error: null };
              },
            }),
          };
        }
        if (table === "payment_transactions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: "pay-1", status: "success" }, error: null }),
                }),
              }),
            }),
            insert: async (row: Row) => {
              inserts.payment_transactions.push(row);
              return { error: null };
            },
          };
        }
        if (table === "finance_transactions") return financeChain();
        throw new Error(`unexpected table: ${table}`);
      },
    },
    inserts,
    orderUpdates,
  };
}

describe("recordTerminalOrderPayment", () => {
  beforeEach(() => {
    finalizeTerminalOrderAfterPayment.mockClear();
  });

  it("posts the missing finance row when the payment was already saved", async () => {
    const db = makeDb({
      id: "order-1",
      tenant_id: "tenant-1",
      provider_id: "prov-1",
      total_amount: 500,
      commercial_model: "once_off_purchase",
      invoice_status: "unpaid",
      finance_transaction_id: null,
    });

    const result = await recordTerminalOrderPayment({
      supabase: db.supabase as never,
      terminalOrderId: "order-1",
      reference: "ref-1",
      amountMajor: 500,
      feesMajor: 15,
      commercialModel: "once_off_purchase",
      source: "paystack_webhook",
      provider: "paystack",
    });

    expect(result.duplicate).toBe(true);
    expect(result.transitionedToPaid).toBe(true);
    expect(result.financeTransactionId).toBe("fin-new");
    expect(db.inserts.payment_transactions).toHaveLength(0);
    expect(db.inserts.finance_transactions).toHaveLength(1);
    expect(db.inserts.finance_transactions[0].transaction_type).toBe("terminal_sale");
    expect(db.inserts.finance_transactions[0].net).toBe(485);
    expect(db.orderUpdates[0].invoice_status).toBe("paid");
    expect(finalizeTerminalOrderAfterPayment).toHaveBeenCalledOnce();
  });

  it("does not post the finance row again when the order is already paid", async () => {
    const db = makeDb(
      {
        id: "order-1",
        tenant_id: "tenant-1",
        provider_id: "prov-1",
        invoice_status: "paid",
        finance_transaction_id: "fin-1",
      },
      {
        finance: [
          {
            id: "fin-1",
            transaction_type: "terminal_sale",
            metadata: { terminal_order_id: "order-1" },
          },
        ],
      },
    );

    const result = await recordTerminalOrderPayment({
      supabase: db.supabase as never,
      terminalOrderId: "order-1",
      reference: "ref-1",
      amountMajor: 500,
      feesMajor: 0,
      commercialModel: "once_off_purchase",
      source: "paystack_verify",
      provider: "paystack",
    });

    expect(result.duplicate).toBe(true);
    expect(result.transitionedToPaid).toBe(false);
    expect(result.financeTransactionId).toBe("fin-1");
    expect(db.inserts.finance_transactions).toHaveLength(0);
    expect(db.orderUpdates).toHaveLength(0);
    expect(finalizeTerminalOrderAfterPayment).not.toHaveBeenCalled();
  });
});
