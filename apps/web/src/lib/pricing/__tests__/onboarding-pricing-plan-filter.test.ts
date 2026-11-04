import { describe, expect, it } from "vitest";
import { filterPricingPlansForOnboarding } from "@/lib/pricing/onboarding-pricing-plan-filter";

describe("filterPricingPlansForOnboarding", () => {
  it("keeps free plans and hides unlinked or period-less paid cards", () => {
    const out = filterPricingPlansForOnboarding([
      { id: "free", is_free: true },
      { id: "bad", is_free: false, subscription_plan_id: null },
      { id: "bad2", is_free: false, subscription_plan_id: "sub-1", available_billing_periods: [] },
      {
        id: "paid",
        is_free: false,
        subscription_plan_id: "sub-1",
        available_billing_periods: ["monthly"],
      },
    ]);
    expect(out.map((p) => p.id)).toEqual(["free", "paid"]);
  });
});
