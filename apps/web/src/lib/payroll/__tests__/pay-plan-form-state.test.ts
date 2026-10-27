import { describe, expect, it } from "vitest";
import {
  defaultPayPlanFormState,
  payPlanFromApiRow,
  payPlanToPostBody,
} from "../pay-plan-form-state";

describe("payPlanToPostBody", () => {
  it("includes marginal tier_mode for pay-plans POST (StaffPayPlanFields parity)", () => {
    const plan = {
      ...defaultPayPlanFormState(),
      tier_mode: "marginal" as const,
      pay_model: "commission_only" as const,
      service_rate: 15,
    };
    const body = payPlanToPostBody(plan, [
      { min_revenue: 0, commission_rate: 10, tier_order: 0 },
      { min_revenue: 5000, commission_rate: 15, tier_order: 1 },
    ]);
    expect(body.tier_mode).toBe("marginal");
    expect(body.pay_model).toBe("commission_only");
    expect(body.tiers).toHaveLength(2);
  });

  it("payPlanFromApiRow restores tier_mode from API row", () => {
    const plan = payPlanFromApiRow({
      pay_model: "commission_only",
      tier_mode: "marginal",
      effective_from: "2026-01-01",
    });
    expect(plan.tier_mode).toBe("marginal");
  });
});
