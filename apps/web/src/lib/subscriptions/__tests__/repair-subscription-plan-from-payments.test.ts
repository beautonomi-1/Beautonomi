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
});
