import { describe, expect, it } from "vitest";
import { computeNetPay } from "../net-pay";

describe("computeNetPay", () => {
  it("subtracts deductions", () => {
    expect(
      computeNetPay({ grossPay: 1000, manualDeductions: 100, taxDeduction: 50 }),
    ).toEqual({ netPay: 850, nextCarryForward: 0 });
  });

  it("carries forward negative net", () => {
    expect(
      computeNetPay({
        grossPay: 100,
        manualDeductions: 200,
        carryForwardBalance: -50,
      }),
    ).toEqual({ netPay: 0, nextCarryForward: -150 });
  });
});
