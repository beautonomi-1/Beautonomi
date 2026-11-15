import { describe, expect, it } from "vitest";
import { buildPayRunItem } from "../gross-pay-assembler";

describe("buildPayRunItem", () => {
  it("stores a net shortfall as a positive carry-forward out", () => {
    const item = buildPayRunItem(
      "s1",
      "Alex",
      { commissionAmount: 100, hourlyAmount: 0, salaryAmount: 0, tipsAmount: 0 },
      { carryForwardBalance: -150 },
    );
    expect(item.netPay).toBe(0);
    expect(item.carryForwardOut).toBe(50);
  });

  it("leaves carry-forward out unset when net pay covers the period", () => {
    const item = buildPayRunItem(
      "s1",
      "Alex",
      { commissionAmount: 100, hourlyAmount: 0, salaryAmount: 0, tipsAmount: 0 },
      { manualDeductions: 20 },
    );
    expect(item.netPay).toBe(80);
    expect(item.carryForwardOut).toBeUndefined();
  });
});
