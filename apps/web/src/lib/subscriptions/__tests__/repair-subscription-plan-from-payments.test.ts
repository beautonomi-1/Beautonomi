import { describe, expect, it, vi } from "vitest";
import { repairSubscriptionPlanFromPayments } from "@/lib/subscriptions/repair-subscription-plan-from-payments";

vi.mock("@/lib/subscriptions/ensure-provider-free-subscription", () => ({
  resolveCatalogPlanIdForProviderSubscription: vi.fn(async () => "free-plan-id"),
}));

describe("repairSubscriptionPlanFromPayments", () => {
  it("skips Apple merchant rows", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: (table: string) => {
        if (table === "finance_transactions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () =>
                  Promise.resolve({
                    data: [
                      {
                        provider_id: "p1",
                        metadata: {
                          plan_id: "paid-plan",
                          term_end: new Date(Date.now() + 86400000).toISOString(),
                        },
                      },
                    ],
                  }),
              }),
            }),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "s1",
                    plan_id: "free-plan-id",
                    billing_provider: "apple",
                    status: "expired",
                  },
                }),
              }),
            }),
            update: (row: unknown) => {
              updates.push(row);
              return { eq: () => Promise.resolve({ error: null }) };
            },
          };
        }
        throw new Error(table);
      },
    } as never;

    const repaired = await repairSubscriptionPlanFromPayments(supabase, "tenant-1");
    expect(repaired).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("does not restore a paid plan after that payment was reversed", async () => {
    const updates: unknown[] = [];
    const finance = [
      {
        id: "pay-1",
        provider_id: "p1",
        transaction_type: "provider_subscription_payment",
        created_at: new Date().toISOString(),
        metadata: {
          plan_id: "paid-plan",
          reference: "ref-1",
          term_end: new Date(Date.now() + 86400000).toISOString(),
          reversed_at: new Date().toISOString(),
        },
      },
      {
        id: "refund-1",
        provider_id: "p1",
        transaction_type: "provider_subscription_refund",
        metadata: { reference: "ref-1", source_payment_id: "pay-1" },
      },
    ];
    const supabase = {
      from: (table: string) => {
        if (table === "finance_transactions") {
          return {
            select: () => ({
              eq: () => ({
                eq: (_column: string, value: string) =>
                  Promise.resolve({
                    data: finance.filter((row) => row.transaction_type === value),
                  }),
              }),
            }),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "s1",
                    plan_id: "free-plan-id",
                    billing_provider: "paystack",
                    status: "active",
                    expires_at: null,
                  },
                }),
              }),
            }),
            update: (row: unknown) => {
              updates.push(row);
              return { eq: () => Promise.resolve({ error: null }) };
            },
          };
        }
        throw new Error(table);
      },
    } as never;

    const repaired = await repairSubscriptionPlanFromPayments(supabase, "tenant-1");
    expect(repaired).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("does not restore a paid plan after the provider moved to free", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: (table: string) => {
        if (table === "finance_transactions") {
          return {
            select: () => ({
              eq: () => ({
                eq: (_column: string, value: string) =>
                  Promise.resolve({
                    data:
                      value === "provider_subscription_payment"
                        ? [
                            {
                              id: "pay-1",
                              provider_id: "p1",
                              created_at: new Date().toISOString(),
                              metadata: {
                                plan_id: "paid-plan",
                                term_end: new Date(Date.now() + 86400000).toISOString(),
                                access_relinquished_at: new Date().toISOString(),
                              },
                            },
                          ]
                        : [],
                  }),
              }),
            }),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "s1",
                    plan_id: "free-plan-id",
                    billing_provider: "paystack",
                    status: "active",
                    expires_at: null,
                  },
                }),
              }),
            }),
            update: (row: unknown) => {
              updates.push(row);
              return { eq: () => Promise.resolve({ error: null }) };
            },
          };
        }
        throw new Error(table);
      },
    } as never;

    const repaired = await repairSubscriptionPlanFromPayments(supabase, "tenant-1");
    expect(repaired).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
