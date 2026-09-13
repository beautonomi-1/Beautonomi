import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkProviderAiEntitlement } from "../entitlements";

vi.mock("@/lib/subscriptions/ensure-provider-free-subscription", () => ({
  resolveCatalogPlanIdForProviderSubscription: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

function mockSupabase(tables: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(() => Promise.resolve({ data: tables[table] ?? null, error: null })),
      };
      if (table === "ai_usage_log") {
        chain.lt = vi.fn(() => Promise.resolve({ count: tables.ai_usage_count ?? 0, error: null }));
      }
      return chain;
    }),
  };
}

describe("checkProviderAiEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not allowed when provider has no resolvable plan", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase({ providers: { ai_opt_out: false }, provider_subscriptions: null }),
    );
    const result = await checkProviderAiEntitlement("provider-1", "ai.provider.profile_completion");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("no_active_plan");
  });

  it("returns not allowed when provider opted out of AI", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase({ providers: { ai_opt_out: true } }),
    );
    const result = await checkProviderAiEntitlement("provider-1", "ai.provider.profile_completion");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("provider_ai_opt_out");
  });

  it("returns allowed when free catalog plan has entitlement", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { resolveCatalogPlanIdForProviderSubscription } = await import(
      "@/lib/subscriptions/ensure-provider-free-subscription"
    );
    (resolveCatalogPlanIdForProviderSubscription as ReturnType<typeof vi.fn>).mockResolvedValue("free-plan");
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase({
        providers: { ai_opt_out: false },
        provider_subscriptions: null,
        ai_plan_entitlements: {
          feature_key: "ai.provider.profile_completion",
          enabled: true,
          calls_per_day: 25,
          max_tokens: 600,
          model_tier: "cheap",
        },
        ai_usage_count: 0,
      }),
    );
    const result = await checkProviderAiEntitlement("provider-1", "ai.provider.profile_completion");
    expect(result.allowed).toBe(true);
    expect(result.entitlement?.feature_key).toBe("ai.provider.profile_completion");
  });

  it("enforces calls_per_day from the entitlement row", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { resolveCatalogPlanIdForProviderSubscription } = await import(
      "@/lib/subscriptions/ensure-provider-free-subscription"
    );
    (resolveCatalogPlanIdForProviderSubscription as ReturnType<typeof vi.fn>).mockResolvedValue("free-plan");
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase({
        providers: { ai_opt_out: false },
        provider_subscriptions: null,
        ai_plan_entitlements: {
          feature_key: "ai.provider.profile_completion",
          enabled: true,
          calls_per_day: 25,
          max_tokens: 600,
          model_tier: "cheap",
        },
        ai_usage_count: 25,
      }),
    );
    const result = await checkProviderAiEntitlement("provider-1", "ai.provider.profile_completion");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("plan_daily_limit_exceeded");
  });

  it("returns not allowed when plan has no entitlement for feature", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(
      mockSupabase({
        providers: { ai_opt_out: false },
        provider_subscriptions: { plan_id: "plan-1", status: "active" },
        ai_plan_entitlements: null,
      }),
    );
    const result = await checkProviderAiEntitlement("provider-1", "ai.provider.profile_completion");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("feature_not_entitled");
  });
});
