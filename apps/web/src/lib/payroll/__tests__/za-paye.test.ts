import { describe, it, expect } from "vitest";
import { calculateZaStatutory, estimateZaPaye, zaTaxYearBounds } from "../jurisdictions/packs/za";
import type { StatutoryContext } from "../jurisdictions/types";

/** SARS 2027 year of assessment (1 Mar 2026 – 28 Feb 2027), migration 10114. */
const brackets2027 = [
  { upTo: 245_100, rate: 18, base: 0 },
  { upTo: 383_100, rate: 26, base: 44_118 },
  { upTo: 530_200, rate: 31, base: 79_998 },
  { upTo: 695_800, rate: 36, base: 125_599 },
  { upTo: 887_000, rate: 39, base: 185_215 },
  { upTo: 1_878_600, rate: 41, base: 259_783 },
  { upTo: null, rate: 45, base: 666_339 },
];

const rebates = { primary: 17_820, secondary: 27_585, tertiary: 30_834 };

const ruleData = {
  incomeTax: { brackets: brackets2027, rebates, payPeriodsPerYear: 12 },
  social: { uifRateEmployee: 0.01, uifCeiling: 17_712 },
};

function ctx(overrides: Partial<StatutoryContext> = {}): StatutoryContext {
  return {
    jurisdictionCode: "ZA",
    payDate: "2026-04-25",
    periodGross: 30_000,
    ytdTaxable: 0,
    employmentType: "employee",
    statutoryMode: "auto",
    ...overrides,
  };
}

describe("estimateZaPaye (SARS periodic method)", () => {
  it("R30 000/month under 65: (44 118 + 26% × 114 900 − 17 820) / 12", () => {
    expect(estimateZaPaye(30_000, 12, brackets2027, rebates, 30)).toBeCloseTo(4681.0, 2);
  });

  it("applies the cumulative secondary rebate at 65+", () => {
    expect(estimateZaPaye(30_000, 12, brackets2027, rebates, 70)).toBeCloseTo(3867.25, 2);
  });

  it("applies the cumulative tertiary rebate at 75+", () => {
    // 73 992 − 30 834 = 43 158 / 12
    expect(estimateZaPaye(30_000, 12, brackets2027, rebates, 80)).toBeCloseTo(3596.5, 2);
  });

  it("top bracket: R100 000/month", () => {
    expect(estimateZaPaye(100_000, 12, brackets2027, rebates, 40)).toBeCloseTo(30857.75, 2);
  });

  it("is zero below the R99 000 tax threshold", () => {
    expect(estimateZaPaye(8_000, 12, brackets2027, rebates)).toBe(0);
  });

  it("weekly pay annualises to the same annual PAYE as monthly", () => {
    const monthly = estimateZaPaye(30_000, 12, brackets2027, rebates, 30);
    const weekly = estimateZaPaye(30_000 * 12 / 52, 52, brackets2027, rebates, 30);
    expect(weekly * 52).toBeCloseTo(monthly * 12, 0);
  });
});

describe("calculateZaStatutory", () => {
  it("does not reduce PAYE taxable income by employee UIF", () => {
    const res = calculateZaStatutory(ctx(), ruleData);
    const byCode = Object.fromEntries(res.lines.map((l) => [l.code, l.amount]));
    expect(byCode.uif_employee).toBeCloseTo(177.12, 2);
    expect(byCode.taxable_income).toBe(30_000);
    expect(byCode.paye_estimate).toBeCloseTo(4681.0, 2);
  });

  it("first month of the tax year withholds the full periodic PAYE (no YTD back-loading)", () => {
    const march = calculateZaStatutory(ctx({ payDate: "2026-03-25", ytdTaxable: 0 }), ruleData);
    const january = calculateZaStatutory(ctx({ payDate: "2027-01-25", ytdTaxable: 300_000 }), ruleData);
    const paye = (r: typeof march) => r.lines.find((l) => l.code === "paye_estimate")?.amount;
    expect(paye(march)).toBeCloseTo(4681.0, 2);
    expect(paye(january)).toBeCloseTo(4681.0, 2);
  });

  it("caps UIF at the monthly ceiling", () => {
    const res = calculateZaStatutory(ctx({ periodGross: 50_000 }), ruleData);
    expect(res.lines.find((l) => l.code === "uif_employee")?.amount).toBeCloseTo(177.12, 2);
  });

  it("scales the UIF ceiling for weekly periods", () => {
    const res = calculateZaStatutory(ctx({ periodGross: 10_000, periodsPerYearOverride: 52 }), ruleData);
    // 17 712 × 12 / 52 = 4 087.38 → 1%
    expect(res.lines.find((l) => l.code === "uif_employee")?.amount).toBeCloseTo(40.87, 2);
  });

  it("exempts contractors and statutory_mode none", () => {
    expect(calculateZaStatutory(ctx({ employmentType: "contractor" }), ruleData).lines).toEqual([]);
    expect(calculateZaStatutory(ctx({ statutoryMode: "none" }), ruleData).lines).toEqual([]);
  });

  it("returns manual for staff_manual_mode", () => {
    expect(calculateZaStatutory(ctx({ statutoryMode: "manual" }), ruleData).mode).toBe("manual");
  });
});

describe("zaTaxYearBounds", () => {
  it("March–December pay dates belong to the tax year starting that March", () => {
    expect(zaTaxYearBounds("2026-03-01")).toEqual({ start: "2026-03-01", end: "2027-02-28" });
    expect(zaTaxYearBounds("2026-12-31")).toEqual({ start: "2026-03-01", end: "2027-02-28" });
  });

  it("January/February pay dates belong to the tax year that started the previous March", () => {
    expect(zaTaxYearBounds("2027-01-25")).toEqual({ start: "2026-03-01", end: "2027-02-28" });
    expect(zaTaxYearBounds("2028-02-29")).toEqual({ start: "2027-03-01", end: "2028-02-29" });
  });
});
