import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any> | null;
let nextRow: Row = null;

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const api: Record<string, any> = {
        select: () => api,
        eq: () => api,
        in: () => api,
        or: () => api,
        order: () => api,
        limit: () => api,
        maybeSingle: async () => ({ data: nextRow, error: null }),
      };
      return api;
    },
  }),
}));

import { determineProviderPlan } from "../entitlements";

describe("determineProviderPlan status consistency", () => {
  beforeEach(() => {
    nextRow = null;
  });

  it("returns the plan for an active subscription", async () => {
    nextRow = { plan_id: "plan-1", status: "active", updated_at: new Date().toISOString() };
    expect(await determineProviderPlan("prov-1")).toBe("plan-1");
  });

  it("returns the plan for a trialing subscription", async () => {
    nextRow = { plan_id: "plan-1", status: "trialing", updated_at: new Date().toISOString() };
    expect(await determineProviderPlan("prov-1")).toBe("plan-1");
  });

  it("grants past_due within the grace window", async () => {
    nextRow = {
      plan_id: "plan-1",
      status: "past_due",
      updated_at: new Date().toISOString(),
    };
    expect(await determineProviderPlan("prov-1")).toBe("plan-1");
  });

  it("revokes past_due beyond the grace window (falls back to free)", async () => {
    nextRow = {
      plan_id: "plan-1",
      status: "past_due",
      updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(await determineProviderPlan("prov-1")).toBeNull();
  });

  it("returns null when no entitled subscription exists", async () => {
    nextRow = null;
    expect(await determineProviderPlan("prov-1")).toBeNull();
  });
});
