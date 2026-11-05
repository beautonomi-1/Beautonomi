import type { StatutoryContext, StatutoryLine, StatutoryResult } from "../types";

/** ZA defaults — values must match published payroll_rule_sets rows when seeded. */
const UIF_RATE_EMPLOYEE = 0.01;
const UIF_MONTHLY_CEILING = 17_712;
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ZA year of assessment runs 1 March – end of February. */
export function zaTaxYearBounds(payDate: string): { start: string; end: string } {
  const year = Number(payDate.slice(0, 4));
  const month = Number(payDate.slice(5, 7));
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  const leap = (endYear % 4 === 0 && endYear % 100 !== 0) || endYear % 400 === 0;
  return { start: `${startYear}-03-01`, end: `${endYear}-02-${leap ? "29" : "28"}` };
}

/**
 * SARS periodic (tables) method: annual equivalent = period remuneration × periods per year,
 * tax on that less the age rebate (rebate values are cumulative, e.g. secondary = primary + secondary),
 * divided back over the periods. Bracket `base` is the tax on income up to the previous band's cap.
 */
export function estimateZaPaye(
  periodTaxable: number,
  payPeriodsPerYear: number,
  brackets: Array<{ upTo: number | null; rate: number; base: number }>,
  rebates: { primary: number; secondary?: number; tertiary?: number },
  ageYears?: number,
): number {
  const annual = periodTaxable * payPeriodsPerYear;
  const sorted = [...brackets].sort((a, b) => {
    const au = a.upTo ?? Number.POSITIVE_INFINITY;
    const bu = b.upTo ?? Number.POSITIVE_INFINITY;
    return au - bu;
  });

  let tax = 0;
  let prevCap = 0;
  for (const b of sorted) {
    const cap = b.upTo ?? Number.POSITIVE_INFINITY;
    if (annual <= cap) {
      tax = b.base + ((annual - prevCap) * b.rate) / 100;
      break;
    }
    if (b.upTo != null) prevCap = b.upTo;
  }

  let rebate = rebates.primary;
  if (ageYears != null && ageYears >= 75) rebate = rebates.tertiary ?? rebate;
  else if (ageYears != null && ageYears >= 65) rebate = rebates.secondary ?? rebate;

  const annualTax = Math.max(0, tax - rebate);
  return round2(annualTax / payPeriodsPerYear);
}

export function calculateZaStatutory(
  ctx: StatutoryContext,
  ruleData: {
    incomeTax?: {
      brackets: Array<{ upTo: number | null; rate: number; base: number }>;
      rebates: { primary: number; secondary?: number; tertiary?: number };
      payPeriodsPerYear?: number;
    };
    social?: { uifCeiling?: number; uifRateEmployee?: number };
    sdl?: { rate?: number; annualThreshold?: number };
  },
): StatutoryResult {
  if (ctx.statutoryMode === "none" || ctx.employmentType === "contractor") {
    return { mode: "auto", reason: "contractor_exempt", lines: [] };
  }
  if (ctx.statutoryMode === "manual") {
    return { mode: "manual", reason: "staff_manual_mode", lines: [] };
  }

  const lines: StatutoryLine[] = [];
  const uifCeilingMonthly = ruleData.social?.uifCeiling ?? UIF_MONTHLY_CEILING;
  const uifRate = ruleData.social?.uifRateEmployee ?? UIF_RATE_EMPLOYEE;
  const periodsPerYear =
    ctx.periodsPerYearOverride ?? ruleData.incomeTax?.payPeriodsPerYear ?? 12;
  const uifCeilingPeriod =
    periodsPerYear > 0 ? round2((uifCeilingMonthly * 12) / periodsPerYear) : uifCeilingMonthly;
  const uifBase = Math.min(ctx.periodGross, uifCeilingPeriod);
  const uif = round2(uifBase * uifRate);
  if (uif > 0) {
    lines.push({
      code: "uif_employee",
      kind: "deduction",
      amount: uif,
      description: "UIF (employee)",
    });
  }

  const it = ruleData.incomeTax;
  if (it?.brackets?.length) {
    // Employee UIF is not an allowable deduction for PAYE (only retirement-fund contributions / donations are).
    const taxableForPaye = Math.max(0, ctx.periodGross);
    lines.push({
      code: "taxable_income",
      kind: "deduction",
      amount: taxableForPaye,
      description: "Taxable income (period)",
    });
    const paye = estimateZaPaye(
      taxableForPaye,
      periodsPerYear,
      it.brackets,
      it.rebates,
      ctx.ageYears,
    );
    if (paye > 0) {
      lines.push({
        code: "paye_estimate",
        kind: "deduction",
        amount: paye,
        description: "PAYE (estimate — confirm with your accountant)",
        editable: true,
      });
    }
  }

  return { mode: "auto", lines };
}
