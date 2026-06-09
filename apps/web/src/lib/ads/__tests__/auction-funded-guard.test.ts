import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The auction must only ever serve campaigns that are backed by a verified,
 * non-reversed payment. Migration 664 added `ads_campaigns.funded_at`, and the
 * auction's eligibility query gained `.not("funded_at", "is", null)` on top of
 * `status = 'active'`. This test pins that contract so a regression that drops
 * the funded guard (and lets unfunded/reversed campaigns serve) fails loudly.
 */

type Call = { method: string; args: unknown[] };

const calls: Record<string, Call[]> = {};

function recordingBuilder(table: string) {
  calls[table] = calls[table] ?? [];
  const data: Record<string, unknown> =
    table === "ads_module_config"
      ? { enabled: true, max_sponsored_slots: 5, cost_per_impression_ratio: 0.05 }
      : {};
  const builder: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      calls[table].push({ method: "select", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls[table].push({ method: "eq", args });
      return builder;
    },
    not: (...args: unknown[]) => {
      calls[table].push({ method: "not", args });
      return builder;
    },
    in: (...args: unknown[]) => {
      calls[table].push({ method: "in", args });
      return builder;
    },
    gte: (...args: unknown[]) => {
      calls[table].push({ method: "gte", args });
      return builder;
    },
    // ads_module_config resolves via maybeSingle; campaigns resolves via await.
    maybeSingle: async () => ({ data, error: null }),
    then: (resolve: (value: unknown) => unknown, reject?: (r: unknown) => unknown) =>
      // Return no campaigns so the auction short-circuits after the eligibility
      // query — we only care that the funded guard was applied.
      Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => recordingBuilder(table) }),
}));

import { runAdsAuction } from "../auction";

describe("runAdsAuction funded guard", () => {
  afterEach(() => {
    for (const key of Object.keys(calls)) delete calls[key];
    vi.clearAllMocks();
  });

  it("requires status=active AND a non-null funded_at on the campaigns query", async () => {
    const winners = await runAdsAuction({
      tenantId: "tenant-1",
      maxSlots: 5,
    });

    expect(winners).toEqual([]);

    const campaignCalls = calls.ads_campaigns ?? [];
    const eqStatusActive = campaignCalls.some(
      (c) => c.method === "eq" && c.args[0] === "status" && c.args[1] === "active",
    );
    const fundedGuard = campaignCalls.some(
      (c) => c.method === "not" && c.args[0] === "funded_at" && c.args[1] === "is" && c.args[2] === null,
    );

    expect(eqStatusActive).toBe(true);
    expect(fundedGuard).toBe(true);
  });

  it("does not run the auction without a tenant", async () => {
    const winners = await runAdsAuction({ tenantId: "", maxSlots: 5 });
    expect(winners).toEqual([]);
    // No campaigns query should have run.
    expect(calls.ads_campaigns).toBeUndefined();
  });
});
