import { describe, expect, it } from "vitest";
import {
  defaultPayPlanFormState,
  payModelUsesCommission,
  payPlanDateError,
  payPlanFromApiRow,
  payPlanToPostBody,
  staffMoneyFromPayPlan,
} from "../pay-plan-form-state";

describe("payModelUsesCommission", () => {
  it("hides the commission ladder for salary, hourly, and booth rental", () => {
    expect(payModelUsesCommission("salary")).toBe(false);
    expect(payModelUsesCommission("hourly")).toBe(false);
    expect(payModelUsesCommission("booth_renter")).toBe(false);
    expect(payModelUsesCommission("commission_only")).toBe(true);
    expect(payModelUsesCommission("hourly_plus_commission")).toBe(true);
  });
});

describe("payPlanToPostBody", () => {
  it("includes marginal tier_mode for pay-plans POST (StaffPayPlanFields parity)", () => {
    const plan = {
      ...defaultPayPlanFormState(),
      tier_mode: "marginal" as const,
      pay_model: "commission_only" as const,
      service_rate: 15,
      base_amount: 8000,
      hourly_rate: 120,
    };
    const body = payPlanToPostBody(plan, [
      { min_revenue: 0, commission_rate: 10, tier_order: 0 },
      { min_revenue: 5000, commission_rate: 15, tier_order: 1 },
    ]);
    expect(body.tier_mode).toBe("marginal");
    expect(body.pay_model).toBe("commission_only");
    expect(body.tiers).toHaveLength(2);
    expect(body.base_amount).toBeNull();
    expect(body.hourly_rate).toBeNull();
  });

  it("keeps a zero product rate and a zero service rate", () => {
    const body = payPlanToPostBody(
      {
        ...defaultPayPlanFormState(),
        pay_model: "commission_only",
        service_rate: 0,
        product_rate: 0,
      },
      [],
    );
    expect(body.service_rate).toBe(0);
    expect(body.product_rate).toBe(0);
  });

  it("keeps a zero hourly rate and a zero sales target", () => {
    const hourly = payPlanToPostBody(
      { ...defaultPayPlanFormState(), pay_model: "hourly", hourly_rate: 0 },
      [],
    );
    const target = payPlanToPostBody(
      {
        ...defaultPayPlanFormState(),
        pay_model: "commission_above_threshold",
        service_rate: 40,
        threshold_amount: 0,
      },
      [],
    );
    expect(hourly.hourly_rate).toBe(0);
    expect(target.threshold_amount).toBe(0);
  });

  it("payPlanFromApiRow restores tier_mode from API row", () => {
    const plan = payPlanFromApiRow({
      pay_model: "commission_only",
      tier_mode: "marginal",
      effective_from: "2026-01-01",
    });
    expect(plan.tier_mode).toBe("marginal");
  });

  it("keeps staff salary and rates aligned with the pay plan", () => {
    const money = staffMoneyFromPayPlan({
      ...defaultPayPlanFormState(),
      pay_model: "salary",
      base_amount: 8000,
      service_rate: 40,
    });
    expect(money.salary).toBe(8000);
    expect(money.commission_enabled).toBe(false);
    expect(money.hourly_rate).toBe(0);
  });

  it("drops a leftover salary when a commission-only plan is loaded", () => {
    const plan = payPlanFromApiRow(
      {
        pay_model: "commission_only",
        base_amount: 8000,
        hourly_rate: 120,
        service_rate: 40,
      },
      { base_amount: 8000, hourly_rate: 120 },
    );
    expect(plan.base_amount).toBe(0);
    expect(plan.hourly_rate).toBe(0);
    expect(plan.service_rate).toBe(40);
  });

  it("rejects an employment end date before the start", () => {
    expect(
      payPlanDateError({
        ...defaultPayPlanFormState(),
        employment_start_date: "2026-06-01",
        employment_end_date: "2026-01-01",
      }),
    ).toMatch(/before the start/);
  });
});
