import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkProviderAiEntitlement } from "../entitlements";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe("checkProviderAiEntitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not allowed when provider has no active plan", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "provider_subscriptions")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
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

  it("returns not allowed when plan has no entitlement for feature", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "provider_subscriptions")
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(() =>
                        Promise.resolve({ data: { plan_id: "plan-1" }, error: null })
                      ),
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
