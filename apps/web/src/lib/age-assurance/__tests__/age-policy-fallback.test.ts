import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error("db unavailable");
  }),
}));

describe("resolveAgeAssurancePolicy fallback", () => {
  it("falls back to enforce when feature flag read fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { resolveAgeAssurancePolicy } = await import("../age-policy");
    const policy = await resolveAgeAssurancePolicy(null);
    expect(policy.socialAgeGateMode).toBe("enforce");
  });
});
