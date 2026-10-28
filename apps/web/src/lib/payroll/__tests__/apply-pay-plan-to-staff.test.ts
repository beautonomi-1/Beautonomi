import { describe, expect, it } from "vitest";
import { providerStaffPatchFromPayPlan } from "../apply-pay-plan-to-staff";

describe("providerStaffPatchFromPayPlan", () => {
  it("enables commission and clears salary for commission-only", () => {
    const patch = providerStaffPatchFromPayPlan({
      pay_model: "commission_only",
      service_rate: 40,
      product_rate: 10,
    });
    expect(patch.commission_enabled).toBe(true);
    expect(patch.service_commission_rate).toBe(40);
    expect(patch.salary).toBe(0);
    expect(patch.hourly_rate).toBe(0);
  });

  it("sets salary for salary model", () => {
    const patch = providerStaffPatchFromPayPlan({
      pay_model: "salary",
      base_amount: 12000,
    });
    expect(patch.commission_enabled).toBe(false);
    expect(patch.salary).toBe(12000);
  });
});
