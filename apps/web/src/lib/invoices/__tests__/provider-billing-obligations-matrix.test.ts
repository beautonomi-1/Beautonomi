import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildProviderBillingObligations } from "../provider-billing-obligations";

const payoutMock = vi.fn();

vi.mock("@/lib/provider/available-payout-balance", () => ({
  getAvailablePayoutBalance: (...args: unknown[]) => payoutMock(...args),
}));

type TableRows = Record<string, unknown[]>;

function makeSupabase(rows: TableRows) {
  const from = vi.fn((table: string) => {
    const data = rows[table] ?? [];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "in", "order", "limit", "gte", "lte", "lt", "gt"]) {
      chain[m] = vi.fn(self);
    }
    chain.maybeSingle = vi.fn(async () => ({ data: data[0] ?? null, error: null }));
    chain.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
    return chain;
  });
  return { from } as unknown as SupabaseClient;
}

describe("buildProviderBillingObligations (plan matrix)", () => {
  beforeEach(() => {
    payoutMock.mockResolvedValue({
      rawBalance: 0,
      hasNegativeBalance: false,
    });
  });

  it("Paystack past_due → subscription due + subscription_pay", async () => {
    const supabase = makeSupabase({
      providers: [{ currency: "ZAR" }],
      provider_subscriptions: [
        {
          id: "sub-1",
          status: "past_due",
          billing_provider: "paystack",
          plan: { name: "Pro", is_free: false, currency: "ZAR", price_monthly: 299 },
        },
      ],
      provider_subscription_orders: [],
      provider_invoices: [],
      terminal_orders: [],
      provider_billing_activity: [],
    });
    const { obligations } = await buildProviderBillingObligations(supabase, "p1", {
      includeReceipts: false,
    });
    const sub = obligations.find((o) => o.kind === "subscription");
    expect(sub?.status).toBe("due");
    expect(sub?.pay_action).toBe("subscription_pay");
  });

  it("Stripe past_due → stripe_manage", async () => {
    const supabase = makeSupabase({
      providers: [{ currency: "ZAR" }],
      provider_subscriptions: [
        {
          id: "sub-1",
          status: "past_due",
          billing_provider: "stripe",
          plan: { name: "Pro", is_free: false, currency: "ZAR", price_monthly: 299 },
        },
      ],
      provider_subscription_orders: [],
      provider_invoices: [],
      terminal_orders: [],
      provider_billing_activity: [],
    });
    const { obligations } = await buildProviderBillingObligations(supabase, "p1", {
      includeReceipts: false,
    });
    expect(obligations.find((o) => o.kind === "subscription")?.pay_action).toBe("stripe_manage");
  });

  it("Apple past_due → apple_manage", async () => {
    const supabase = makeSupabase({
      providers: [{ currency: "ZAR" }],
      provider_subscriptions: [
        {
          id: "sub-1",
          status: "past_due",
          billing_provider: "apple",
          plan: { name: "Pro", is_free: false, currency: "ZAR", price_monthly: 299 },
        },
      ],
      provider_subscription_orders: [],
      provider_invoices: [],
      terminal_orders: [],
      provider_billing_activity: [],
    });
    const { obligations } = await buildProviderBillingObligations(supabase, "p1", {
      includeReceipts: false,
    });
    expect(obligations.find((o) => o.kind === "subscription")?.pay_action).toBe("apple_manage");
  });

  it("active paid subscription with no billing issue → no subscription due row", async () => {
    const supabase = makeSupabase({
      providers: [{ currency: "ZAR" }],
      provider_subscriptions: [
        {
          id: "sub-1",
          status: "active",
          billing_provider: "paystack",
          paystack_sync_pending: false,
          plan_id: "plan-1",
          plan: { id: "plan-1", name: "Pro", is_free: false, currency: "ZAR", price_monthly: 299 },
        },
      ],
      provider_subscription_orders: [],
      provider_invoices: [],
      terminal_orders: [],
      provider_billing_activity: [],
    });
    const { obligations } = await buildProviderBillingObligations(supabase, "p1", {
      includeReceipts: false,
    });
    expect(obligations.some((o) => o.kind === "subscription" && o.status === "due")).toBe(false);
  });

  it("unpaid terminal order → terminal_pay; zero bundle excluded", async () => {
    const supabase = makeSupabase({
      providers: [{ currency: "ZAR" }],
      provider_subscriptions: [],
      provider_invoices: [],
      terminal_orders: [
        {
          id: "to-1",
          order_status: "confirmed",
          invoice_status: "issued",
          total_amount: 1200,
          currency: "ZAR",
          commercial_model: "once_off_purchase",
        },
        {
          id: "to-2",
          order_status: "confirmed",
          invoice_status: "issued",
          total_amount: 0,
          currency: "ZAR",
          commercial_model: "once_off_purchase",
        },
        {
          id: "to-3",
          order_status: "confirmed",
          invoice_status: "issued",
          total_amount: 500,
          currency: "ZAR",
          commercial_model: "subscription_bundle",
        },
      ],
      provider_billing_activity: [],
    });
    const { obligations } = await buildProviderBillingObligations(supabase, "p1", {
      includeReceipts: false,
    });
    const terminalDue = obligations.filter((o) => o.kind === "terminal_order");
    expect(terminalDue).toHaveLength(1);
    expect(terminalDue[0].pay_action).toBe("terminal_pay");
    expect(terminalDue[0].amount).toBe(1200);
  });

  it("negative payout balance → payout_offset, excluded from outstanding_total", async () => {
    payoutMock.mockResolvedValue({ rawBalance: -75.5, hasNegativeBalance: true });
    const supabase = makeSupabase({
      providers: [{ currency: "ZAR" }],
      provider_subscriptions: [],
      provider_invoices: [],
      terminal_orders: [],
      provider_billing_activity: [],
    });
    const result = await buildProviderBillingObligations(supabase, "p1", {
      includeReceipts: false,
    });
    const offset = result.obligations.find((o) => o.pay_action === "payout_offset");
    expect(offset?.amount).toBe(75.5);
    expect(result.outstanding_total).toBe(0);
  });

  it("paid ads receipt appears as paid; no ads due from unpaid checkout", async () => {
    const supabase = makeSupabase({
      providers: [{ currency: "ZAR" }],
      provider_subscriptions: [],
      provider_invoices: [],
      terminal_orders: [],
      provider_billing_activity: [
        {
          id: "r1",
          type: "provider_ads_payment",
          amount: 50,
          currency: "ZAR",
          description: "Ads budget",
          occurred_at: "2026-01-01T00:00:00Z",
          direction: "charge",
        },
      ],
    });
    const { obligations } = await buildProviderBillingObligations(supabase, "p1", {
      includeReceipts: true,
    });
    expect(obligations.some((o) => o.status === "due" && o.kind.includes("ads"))).toBe(false);
    expect(obligations.some((o) => o.status === "paid" && o.kind === "provider_ads_payment")).toBe(
      true,
    );
  });
});
