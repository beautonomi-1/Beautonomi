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

  it("pays service and product rates only on sales above the target", () => {
    const lines = computeCompensation(
      {
        payModel: "commission_above_threshold",
        serviceRate: 40,
        productRate: 10,
        thresholdAmount: 5000,
      },
      { serviceRevenue: 8000, productRevenue: 2000 },
      0,
    );
    expect(sumCompensationLines(lines)).toBe(1700);
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

  it("marginal tier mode applies commission per band (not retroactive whole-period rate)", () => {
    const tiers = [
      { minRevenue: 0, commissionRate: 10 },
      { minRevenue: 1000, commissionRate: 20 },
    ];
    const marginal = sumCompensationLines(
      computeCompensation(
        {
          payModel: "commission_only",
          serviceRate: 10,
          serviceTiers: tiers,
          tierMode: "marginal",
        },
        { serviceRevenue: 1500, productRevenue: 0 },
        0,
      ),
    );
    const retroactive = sumCompensationLines(
      computeCompensation(
        {
          payModel: "commission_only",
          serviceRate: 10,
          serviceTiers: tiers,
          tierMode: "retroactive",
        },
        { serviceRevenue: 1500, productRevenue: 0 },
        0,
      ),
    );
    expect(marginal).toBe(200);
    expect(retroactive).toBe(300);
  });

  it("applies a marginal tier once to combined sales, and the base rate below the first tier", () => {
    const tiers = [
      { minRevenue: 1000, commissionRate: 20 },
    ];
    const crossed = sumCompensationLines(
      computeCompensation(
        {
          payModel: "commission_only",
          serviceRate: 10,
          productRate: 10,
          serviceTiers: tiers,
          tierMode: "marginal",
        },
        { serviceRevenue: 800, productRevenue: 800 },
        0,
      ),
    );
    const belowAndAbove = sumCompensationLines(
      computeCompensation(
        {
          payModel: "commission_only",
          serviceRate: 10,
          serviceTiers: tiers,
          tierMode: "marginal",
        },
        { serviceRevenue: 1500, productRevenue: 0 },
        0,
      ),
    );
    expect(crossed).toBe(220);
    expect(belowAndAbove).toBe(200);
  });

  it("keeps the guarantee when a product return leaves commission below the base", () => {
    const lines = computeCompensation(
      { payModel: "base_or_commission_higher", serviceRate: 40 },
      {
        serviceRevenue: 12750,
        productRevenue: 0,
        serviceCommissionFromLedger: 5100,
        returnCommission: -200,
      },
      5000,
    );
    expect(lines.map((line) => line.code)).toEqual(["salary_guarantee"]);
    expect(sumCompensationLines(lines)).toBe(5000);
  });

  it("pays commission when it still beats the guarantee after a product return", () => {
    const lines = computeCompensation(
      { payModel: "base_or_commission_higher", serviceRate: 40 },
      {
        serviceRevenue: 15000,
        productRevenue: 0,
        serviceCommissionFromLedger: 6000,
        returnCommission: -200,
      },
      5000,
    );
    expect(sumCompensationLines(lines)).toBe(5800);
  });

  it("takes only the net shortfall off the guarantee when the return is larger than this period's commission", () => {
    const lines = computeCompensation(
      { payModel: "base_or_commission_higher", serviceRate: 40 },
      {
        serviceRevenue: 250,
        productRevenue: 0,
        serviceCommissionFromLedger: 100,
        returnCommission: -200,
      },
      5000,
    );
    expect(sumCompensationLines(lines)).toBe(4900);
  });

  it("still takes a product return off when sales stay under the target", () => {
    const lines = computeCompensation(
      {
        payModel: "commission_above_threshold",
        serviceRate: 40,
        productRate: 10,
        thresholdAmount: 5000,
      },
      { serviceRevenue: 4000, productRevenue: 0, returnCommission: -20 },
      0,
    );
    expect(sumCompensationLines(lines)).toBe(-20);
  });

  it("keeps a product return when nothing else was sold in the period", () => {
    expect(
      sumCompensationLines(
        computeCompensation(
          { payModel: "commission_only", serviceRate: 40, productRate: 10 },
          { serviceRevenue: 0, productRevenue: -200, productCommissionFromLedger: -20 },
          0,
        ),
      ),
    ).toBe(-20);
  });
});
