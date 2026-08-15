import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkProviderAiEntitlement } from "../entitlements";

vi.mock("@/lib/subscriptions/ensure-provider-free-subscription", () => ({
  resolveCatalogPlanIdForProviderSubscription: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe("checkProviderAiEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not allowed when provider has no resolvable plan", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "provider_subscriptions")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  or: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          };
        return { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(() => Promise.resolve({ data: null })) };
      }),
    });
    const result = await checkProviderAiEntitlement("provider-1", "ai.provider.profile_completion");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("no_active_plan");
  });

  it("returns allowed when free catalog plan has entitlement", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { resolveCatalogPlanIdForProviderSubscription } = await import(
      "@/lib/subscriptions/ensure-provider-free-subscription"
    );
    (resolveCatalogPlanIdForProviderSubscription as ReturnType<typeof vi.fn>).mockResolvedValue(
      "free-plan",
    );
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "provider_subscriptions")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  or: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          };
        if (table === "ai_plan_entitlements")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: {
                        feature_key: "ai.provider.profile_completion",
                        enabled: true,
                        calls_per_day: 25,
                        max_tokens: 600,
                        model_tier: "cheap",
                      },
                      error: null,
                    }),
                  ),
                })),
              })),
            })),
          };
        if (table === "ai_usage_log")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    lt: vi.fn(() => Promise.resolve({ count: 0, error: null })),
                  })),
                })),
              })),
            })),
          };
        return { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(() => Promise.resolve({ data: null })) };
      }),
    });
    const result = await checkProviderAiEntitlement("provider-1", "ai.provider.profile_completion");
    expect(result.allowed).toBe(true);
    expect(result.entitlement?.feature_key).toBe("ai.provider.profile_completion");
  });

  it("enforces calls_per_day from the entitlement row", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { resolveCatalogPlanIdForProviderSubscription } = await import(
      "@/lib/subscriptions/ensure-provider-free-subscription"
    );
    (resolveCatalogPlanIdForProviderSubscription as ReturnType<typeof vi.fn>).mockResolvedValue(
      "free-plan",
    );
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "provider_subscriptions")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  or: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          };
        if (table === "ai_plan_entitlements")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: {
                        feature_key: "ai.provider.profile_completion",
                        enabled: true,
                        calls_per_day: 25,
                        max_tokens: 600,
                        model_tier: "cheap",
                      },
                      error: null,
                    }),
                  ),
                })),
              })),
            })),
          };
        if (table === "ai_usage_log")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  gte: vi.fn(() => ({
                    lt: vi.fn(() => Promise.resolve({ count: 25, error: null })),
                  })),
                })),
              })),
            })),
          };
        return { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(() => Promise.resolve({ data: null })) };
      }),
    });
    const result = await checkProviderAiEntitlement("provider-1", "ai.provider.profile_completion");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("plan_daily_limit_exceeded");
  });

  it("returns not allowed when plan has no entitlement for feature", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "provider_subscriptions")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  or: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(() =>
                          Promise.resolve({
                            data: { plan_id: "plan-1", status: "active" },
                            error: null,
                          }),
                        ),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          };
        if (table === "ai_plan_entitlements")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
            })),
          };
        return { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(() => Promise.resolve({ data: null })) };
      }),
    });
    const result = await checkProviderAiEntitlement("provider-1", "ai.provider.profile_completion");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("feature_not_entitled");
  });
});
