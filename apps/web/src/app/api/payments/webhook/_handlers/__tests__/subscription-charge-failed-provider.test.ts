import { describe, expect, it } from "vitest";
import { processFailedPayment } from "../charge-success";

type Pair = [string, unknown];

function makeDb(
  found: "success" | "failed" | "none",
  subscriptionStatus = "active",
  billingProvider = "paystack",
) {
  const inserts: Record<string, unknown>[] = [];
  const updates: { table: string; filters: Pair[] }[] = [];

  function chain(table: string) {
    const pairs: Pair[] = [];
    const api = {
      select: () => api,
      eq: (key: string, value: unknown) => {
        pairs.push([key, value]);
        return api;
      },
      in: (key: string, value: unknown) => {
        pairs.push([key, value]);
        return api;
      },
      update: () => {
        const filters: Pair[] = [];
        updates.push({ table, filters });
        return {
          eq: (key: string, value: unknown) => {
            filters.push([key, value]);
            return {
              eq: (key2: string, value2: unknown) => {
                filters.push([key2, value2]);
                return { then: (resolve: (value: unknown) => unknown) => resolve({ error: null }) };
              },
              in: (key2: string, value2: unknown) => {
                filters.push([key2, value2]);
                return { then: (resolve: (value: unknown) => unknown) => resolve({ error: null }) };
              },
            };
          },
        };
      },
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row);
        return { error: null };
      },
      maybeSingle: async () => {
        if (table === "provider_subscriptions") {
          return {
            data: {
              status: subscriptionStatus,
              provider_id: "prov-1",
              billing_provider: billingProvider,
              subscription_plans: { name: "Pro" },
            },
            error: null,
          };
        }
        if (table !== "payment_transactions") return { data: null, error: null };
        const provider = pairs.find(([key]) => key === "provider")?.[1];
        const status = pairs.find(([key]) => key === "status")?.[1];
        if (provider !== "stripe") return { data: null, error: null };
        if (found === "success" && status === "success") return { data: { id: "paid" }, error: null };
        if (found === "failed" && status === "failed") return { data: { id: "failed" }, error: null };
        return { data: null, error: null };
      },
    };
    return api;
  }

  return {
    inserts,
    updates,
    supabase: { from: (table: string) => chain(table) },
  };
}

const charge = {
  reference: "ref-stripe",
  amount: 10000,
  fees: 0,
  metadata: { subscription_code: "SUB_1" },
  __paymentProvider: "stripe" as const,
};

describe("subscription renewal charge.failed provider", () => {
  it("does not mark the subscription past due when that provider already saved the payment", async () => {
    const db = makeDb("success");

    await processFailedPayment(charge, db.supabase as never);

    expect(db.updates.map((update) => update.table)).not.toContain("provider_subscriptions");
    expect(db.inserts).toHaveLength(0);
  });

  it("does not record the failure again when that provider already saved it", async () => {
    const db = makeDb("failed");

    await processFailedPayment(charge, db.supabase as never);

    expect(db.updates.map((update) => update.table)).not.toContain("provider_subscriptions");
    expect(db.inserts).toHaveLength(0);
  });

  it("starts the grace date only while the subscription is still active", async () => {
    const db = makeDb("none", "active");

    await processFailedPayment(charge, db.supabase as never);

    const subscriptionUpdate = db.updates.find((update) => update.table === "provider_subscriptions");
    expect(subscriptionUpdate?.filters).toEqual([
      ["paystack_subscription_code", "SUB_1"],
      ["status", "active"],
    ]);
  });

  it("does not mark Apple, Stripe, or Flutterwave past due from a Paystack charge", async () => {
    for (const billingProvider of ["apple", "stripe", "flutterwave"]) {
      const db = makeDb("none", "active", billingProvider);
      await processFailedPayment(charge, db.supabase as never);
      expect(db.updates.map((update) => update.table)).not.toContain("provider_subscriptions");
      expect(db.inserts).toHaveLength(0);
    }
  });

  it("leaves the grace date when the subscription is already past due", async () => {
    const db = makeDb("none", "past_due");

    await processFailedPayment(charge, db.supabase as never);

    expect(db.updates.map((update) => update.table)).not.toContain("provider_subscriptions");
  });
});
