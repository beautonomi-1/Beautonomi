import { describe, expect, it } from "vitest";
import { assembleStaffPayRunGross } from "../assemble-staff-pay-run-gross";

describe("assembleStaffPayRunGross", () => {
  it("uses ledger service commission plus product calc without double-counting product from lines", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: true,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-07",
      payPlan: null,
      productCalc: {
        totalCommission: 300,
        serviceCommission: 200,
        productCommission: 100,
        serviceRevenue: 1000,
        productRevenue: 500,
      },
      linesSummary: {
        commission: 150,
        tips: 0,
        adjustments: -20,
        total: 130,
        adjustment_breakdown: { commission: -20, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(230);
    expect(result.commissionClawback).toBe(20);
  });

  it("applies carry-forward balance to net pay", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-07",
      payPlan: null,
      productCalc: {
        totalCommission: 100,
        serviceCommission: 100,
        productCommission: 0,
        serviceRevenue: 200,
        productRevenue: 0,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
      carryForwardBalance: -50,
    });
    expect(result.carryForwardIn).toBe(50);
    expect(result.netPay).toBe(50);
  });
});
