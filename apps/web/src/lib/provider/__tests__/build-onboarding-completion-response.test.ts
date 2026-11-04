import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveSelectedOnboardingPlan } from "@/lib/provider/build-onboarding-completion-response";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: vi.fn(),
}));

vi.mock("@/lib/subscription/resolve-pricing-plan-is-free", () => ({
  resolvePricingPlanIsFree: vi.fn(
    (
      pricing: { price?: string | number | null },
      linked: { is_free?: boolean | null } | null,
    ) => {
      if (linked?.is_free != null) return linked.is_free === true;
      return String(pricing.price ?? "").toLowerCase().includes("free");
    },
  ),
}));

describe("resolveSelectedOnboardingPlan", () => {
  beforeEach(() => {
    vi.mocked(fetchScopedSingle).mockReset();
  });

  it("marks paid linked plan as requiring checkout", async () => {
    vi.mocked(fetchScopedSingle).mockResolvedValue({
      data: {
        id: "pricing-1",
        price: "R299",
        subscription_plan_id: "sub-paid",
      },
      source: "tenant",
    });
    const supabaseAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { is_free: false } }),
          })),
        })),
      })),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await resolveSelectedOnboardingPlan(
      supabaseAdmin,
      "tenant-1",
      "pricing-1",
    );

    expect(result.selectedPlanIsFree).toBe(false);
    expect(result.selectedPlanRequiresCheckout).toBe(true);
    expect(result.selectedSubscriptionPlanId).toBe("sub-paid");
  });

  it("uses linked is_free for free tier", async () => {
    vi.mocked(fetchScopedSingle).mockResolvedValue({
      data: {
        id: "pricing-free",
        price: "R299",
        subscription_plan_id: "sub-free",
      },
      source: "tenant",
    });
    const supabaseAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { is_free: true } }),
          })),
        })),
      })),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await resolveSelectedOnboardingPlan(
      supabaseAdmin,
      "tenant-1",
      "pricing-free",
    );

    expect(result.selectedPlanIsFree).toBe(true);
    expect(result.selectedPlanRequiresCheckout).toBe(false);
  });
});
