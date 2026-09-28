import { describe, expect, it } from "vitest";
import { computeCompensation, sumCompensationLines } from "../compute-compensation";

describe("computeCompensation", () => {
  it("commission only", () => {
    const lines = computeCompensation(
      { payModel: "commission_only", serviceRate: 50 },
      { serviceRevenue: 1000, productRevenue: 0, serviceCommissionFromLedger: 500 },
      0,
    );
    expect(sumCompensationLines(lines)).toBe(500);
  });

  it("base or commission higher picks commission", () => {
    const lines = computeCompensation(
      { payModel: "base_or_commission_higher", serviceRate: 50 },
      { serviceRevenue: 2000, productRevenue: 0, serviceCommissionFromLedger: 1000 },
      500,
    );
    expect(lines[0]?.amount).toBe(1000);
  });

  it("booth renter earns nothing from engine", () => {
    expect(
      computeCompensation(
        { payModel: "booth_renter" },
        { serviceRevenue: 5000, productRevenue: 0 },
        0,
      ),
    ).toEqual([]);
  });
});
