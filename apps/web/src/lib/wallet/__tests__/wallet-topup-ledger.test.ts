import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

import { applyWalletTopupFromSuccessfulPaystackCharge } from "../apply-wallet-topup-from-paystack-success";

type Row = Record<string, unknown>;

function makeDb(options?: { payment?: Row | null; finance?: Row | null; failPayment?: boolean }) {
  const inserts = { payment_transactions: [] as Row[], finance_transactions: [] as Row[] };
  const rpc = vi.fn(async () => ({ error: null }));

  function lookup(row: Row | null | undefined) {
    const api = {
      select: () => api,
      eq: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: row ?? null, error: null }),
    };
    return api;
  }

  return {
    rpc,
    inserts,
    supabase: {
      from: (table: string) => {
        if (table === "wallet_topups") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "topup-1",
                    status: "paid",
                    currency: "ZAR",
                    user_id: "user-1",
                    tenant_id: "tenant-1",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "wallet_transactions") {
          return lookup({ id: "credit-1" });
        }
        if (table === "payment_transactions") {
          return {
            ...lookup(options?.payment),
            insert: async (row: Row) => {
              if (options?.failPayment) return { error: { code: "XX000", message: "db down" } };
              inserts.payment_transactions.push(row);
              return { error: null };
            },
          };
        }
        if (table === "finance_transactions") {
          return {
            ...lookup(options?.finance),
            insert: async (row: Row) => {
              inserts.finance_transactions.push(row);
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
      rpc,
    },
  };
}

const payload = {
  reference: "ref-1",
  amount: 10000,
  fees: 150,
  metadata: { wallet_topup_id: "topup-1" },
};

describe("applyWalletTopupFromSuccessfulPaystackCharge", () => {
  it("posts the payment and the finance row when the wallet was already credited", async () => {
    const db = makeDb();

    await applyWalletTopupFromSuccessfulPaystackCharge(payload, db.supabase as never);

    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.inserts.payment_transactions).toHaveLength(1);
    expect(db.inserts.payment_transactions[0].transaction_type).toBe("wallet_topup");
    expect(db.inserts.payment_transactions[0].net_amount).toBe(100);
    expect(db.inserts.finance_transactions).toHaveLength(1);
    expect(db.inserts.finance_transactions[0].description).toBe("Wallet topup: topup-1");
    expect(db.inserts.finance_transactions[0].net).toBe(100);
    expect(db.inserts.finance_transactions[0].metadata).toMatchObject({
      reference: "ref-1",
      wallet_topup_id: "topup-1",
    });
  });

  it("does not post either row again when both are already saved", async () => {
    const db = makeDb({
      payment: { id: "pay-1" },
      finance: { id: "fin-1" },
    });

    await applyWalletTopupFromSuccessfulPaystackCharge(payload, db.supabase as never);

    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.inserts.payment_transactions).toHaveLength(0);
    expect(db.inserts.finance_transactions).toHaveLength(0);
  });

  it("does not post the finance row when the payment was not saved", async () => {
    const db = makeDb({ failPayment: true });

    await expect(
      applyWalletTopupFromSuccessfulPaystackCharge(payload, db.supabase as never),
    ).rejects.toThrow("wallet topup payment was not recorded");
    expect(db.inserts.finance_transactions).toHaveLength(0);
  });
});
