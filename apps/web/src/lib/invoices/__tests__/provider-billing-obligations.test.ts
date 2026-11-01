import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildProviderBillingObligations } from "../provider-billing-obligations";

vi.mock("@/lib/provider/available-payout-balance", () => ({
  getAvailablePayoutBalance: vi.fn(async () => ({
    availableBalance: 0,
    pendingPayoutsSum: 0,
    rawBalance: 0,
    hasNegativeBalance: false,
    openDisputeReserve: 0,
    breakdown: {},
  })),
}));

function makeSupabase(rows: Record<string, unknown[]>) {
  const from = vi.fn((table: string) => {
    const data = rows[table] ?? [];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "in", "order", "limit", "gte", "lte"]) {
      chain[m] = vi.fn(self);
    }
    chain.maybeSingle = vi.fn(async () => ({
      data: data[0] ?? null,
      error: null,
    }));
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({ data, error: null });
    return chain;
  });
  return { from } as unknown as SupabaseClient;
}

describe("buildProviderBillingObligations", () => {
  it("excludes platform_fee open invoices from due rows", async () => {
    const supabase = makeSupabase({
      providers: [{ currency: "ZAR" }],
      provider_subscriptions: [],
      provider_invoices: [
        {
          id: "inv-fee",
          invoice_number: "INV-1",
          invoice_type: "platform_fee",
          status: "sent",
          due_date: "2026-12-01",
          total_amount: 100,
          amount_paid: 0,
          amount_due: 100,
          currency: "ZAR",
        },
        {
          id: "inv-other",
          invoice_number: "INV-2",
          invoice_type: "other",
          status: "sent",
          due_date: "2026-12-01",
          total_amount: 50,
          amount_paid: 0,
          amount_due: 50,
          currency: "ZAR",
        },
      ],
      terminal_orders: [],
      provider_billing_activity: [],
    });

    const result = await buildProviderBillingObligations(supabase, "prov-1", {
      today: "2026-11-01",
      includeReceipts: false,
    });

    const dueInvoices = result.obligations.filter(
      (o) => o.kind === "provider_invoice" && o.status === "due",
    );
    expect(dueInvoices).toHaveLength(1);
    expect(dueInvoices[0].entity_id).toBe("inv-other");
    expect(result.outstanding_total).toBe(50);
  });
});
