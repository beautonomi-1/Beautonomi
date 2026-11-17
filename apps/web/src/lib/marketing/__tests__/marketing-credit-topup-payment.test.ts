import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn().mockResolvedValue("tenant-1"),
}));

import { recordMarketingCreditTopupPayment } from "../marketing-credit-topup-payment";

type Row = Record<string, unknown>;

function makeDb(initial: { payments?: Row[]; finance?: Row[]; failPaymentInsert?: boolean }) {
  const payments = [...(initial.payments ?? [])];
  const finance = [...(initial.finance ?? [])];
  const inserts = { payment_transactions: [] as Row[], finance_transactions: [] as Row[] };

  function chain(rows: Row[], table: "payment_transactions" | "finance_transactions") {
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
        data: rows.find((row) => filters.every((fn) => fn(row))) ?? null,
        error: null,
      }),
      delete: () => ({
        eq: async (key: string, value: unknown) => {
          const index = rows.findIndex((row) => row[key] === value);
          if (index >= 0) rows.splice(index, 1);
          return { error: null };
        },
      }),
      insert: async (row: Row) => {
        if (table === "payment_transactions" && initial.failPaymentInsert) {
          return { error: { code: "XX000", message: "db down" } };
        }
        inserts[table].push(row);
        rows.push({ id: `${table}-${rows.length + 1}`, ...row });
        return { error: null };
      },
    };
    return api;
  }

  return {
    supabase: {
      from: (table: string) => {
        if (table === "payment_transactions") return chain(payments, table);
        if (table === "finance_transactions") return chain(finance, table);
        throw new Error(`unexpected table: ${table}`);
      },
    },
    inserts,
    payments,
    finance,
  };
}

describe("recordMarketingCreditTopupPayment", () => {
  it("saves the payment when the finance row is already there", async () => {
    const db = makeDb({
      finance: [
        {
          id: "fin-1",
          provider_id: "prov-1",
          transaction_type: "provider_marketing_credit_topup",
          metadata: { paystack_reference: "ref-1" },
        },
      ],
    });

    const result = await recordMarketingCreditTopupPayment({
      supabase: db.supabase as never,
      providerId: "prov-1",
      reference: "ref-1",
      amountMajor: 100,
      feesMajor: 4,
      currency: "ZAR",
    });

    expect(result).toEqual({ recorded: false, alreadyRecorded: true });
    expect(db.inserts.payment_transactions).toHaveLength(1);
    expect(db.inserts.payment_transactions[0].status).toBe("success");
    expect(db.inserts.payment_transactions[0].net_amount).toBe(96);
    expect(db.inserts.finance_transactions).toHaveLength(0);
  });

  it("does not post either row again when both are already saved", async () => {
    const db = makeDb({
      payments: [
        { id: "pay-1", provider: "paystack", reference: "ref-1", status: "success" },
      ],
      finance: [
        {
          id: "fin-1",
          provider_id: "prov-1",
          transaction_type: "provider_marketing_credit_topup",
          metadata: { paystack_reference: "ref-1" },
        },
      ],
    });

    const result = await recordMarketingCreditTopupPayment({
      supabase: db.supabase as never,
      providerId: "prov-1",
      reference: "ref-1",
      amountMajor: 100,
      feesMajor: 0,
      currency: "ZAR",
    });

    expect(result.alreadyRecorded).toBe(true);
    expect(db.inserts.payment_transactions).toHaveLength(0);
    expect(db.inserts.finance_transactions).toHaveLength(0);
  });

  it("does not post the finance row when the payment was not saved", async () => {
    const db = makeDb({ failPaymentInsert: true });

    await expect(
      recordMarketingCreditTopupPayment({
        supabase: db.supabase as never,
        providerId: "prov-1",
        reference: "ref-1",
        amountMajor: 100,
        feesMajor: 0,
        currency: "ZAR",
      }),
    ).rejects.toThrow("marketing credit payment was not recorded");
    expect(db.inserts.finance_transactions).toHaveLength(0);
  });
});
