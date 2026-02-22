import { describe, it, expect, vi, beforeEach } from "vitest";
import { enforceAiBudget } from "../enforce-budget";

vi.mock("@/lib/supabase/admin");

describe("enforceAiBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns disabled when module not configured", async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    (getSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
    });
    const result = await enforceAiBudget({
      feature_key: "ai.provider.profile_completion",
      actor_user_id: "user-1",
      provider_id: "provider-1",
      role: "provider_owner",
      environment: "production",
    });
    expect(result.allowed).toBe(false);
    expect(result.disabled).toBe(true);
    expect(result.reason).toBe("ai_module_not_configured");
  });
});
