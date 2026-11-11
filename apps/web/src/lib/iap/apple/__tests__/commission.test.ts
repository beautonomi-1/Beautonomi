import { describe, expect, it } from "vitest";
import { computeAppleCommission } from "../config";

describe("computeAppleCommission (F4-06)", () => {
  it("splits 15% commission with canonical rounding", () => {
    expect(computeAppleCommission(100, 0.15)).toEqual({
      commissionMajor: 15,
      proceedsMajor: 85,
    });
  });

  it("clamps a negative rate to 0", () => {
    expect(computeAppleCommission(50, -1)).toEqual({
      commissionMajor: 0,
      proceedsMajor: 50,
    });
  });
});
