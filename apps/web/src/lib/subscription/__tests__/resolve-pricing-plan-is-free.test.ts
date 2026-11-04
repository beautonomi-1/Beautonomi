import { describe, expect, it } from "vitest";
import { resolvePricingPlanIsFree } from "@/lib/subscription/resolve-pricing-plan-is-free";

describe("resolvePricingPlanIsFree", () => {
  it("prefers linked subscription_plans.is_free", () => {
    expect(
      resolvePricingPlanIsFree(
        { price: "R499", paystack_plan_code_monthly: "PLN_x" },
        { is_free: true },
      ),
    ).toBe(true);
    expect(
      resolvePricingPlanIsFree({ price: "Free", paystack_plan_code_monthly: null }, { is_free: false }),
    ).toBe(false);
  });

  it("falls back to legacy price heuristic when unlinked", () => {
    expect(
      resolvePricingPlanIsFree({ price: "Free", paystack_plan_code_monthly: null }, null),
    ).toBe(true);
    expect(
      resolvePricingPlanIsFree({ price: "R299", paystack_plan_code_monthly: "PLN_y" }, null),
    ).toBe(false);
  });
});
