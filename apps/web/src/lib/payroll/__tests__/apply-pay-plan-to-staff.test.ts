import { describe, expect, it } from "vitest";
import { payPlanStoredAmounts, providerStaffPatchFromPayPlan } from "../apply-pay-plan-to-staff";

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

  it("writes a zero product rate onto the staff record", () => {
    const patch = providerStaffPatchFromPayPlan({
      pay_model: "commission_only",
      service_rate: 40,
      product_rate: 0,
    });
    expect(patch.service_commission_rate).toBe(40);
    expect(patch.product_commission_rate).toBe(0);
  });

  it("sets salary for salary model", () => {
    const patch = providerStaffPatchFromPayPlan({
      pay_model: "salary",
      base_amount: 12000,
    });
    expect(patch.commission_enabled).toBe(false);
    expect(patch.salary).toBe(12000);
    expect(patch.service_commission_rate).toBe(0);
    expect(patch.product_commission_rate).toBe(0);
  });

  it("stores no salary on a commission-only plan", () => {
    expect(
      payPlanStoredAmounts({
        pay_model: "commission_only",
        base_amount: 8000,
        hourly_rate: 120,
        service_rate: 40,
        threshold_amount: 5000,
      }),
    ).toEqual({
      base_amount: null,
      hourly_rate: null,
      service_rate: 40,
      product_rate: null,
      threshold_amount: null,
    });
  });

  it("clears salary and hourly when the plan is a booth renter", () => {
    const patch = providerStaffPatchFromPayPlan({
      pay_model: "booth_renter",
      base_amount: 8000,
      hourly_rate: 100,
    });
    expect(patch.salary).toBe(0);
    expect(patch.hourly_rate).toBe(0);
    expect(patch.commission_enabled).toBe(false);
    expect(patch.service_commission_rate).toBe(0);
  });

  it("does not write employment type onto provider_staff", () => {
    const patch = providerStaffPatchFromPayPlan({
      pay_model: "commission_only",
      employment_type: "contractor",
    });
    expect(patch.employment_type).toBeUndefined();
  });
});
