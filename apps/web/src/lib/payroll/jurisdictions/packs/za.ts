import type { StatutoryContext, StatutoryLine, StatutoryResult } from "../types";

/** ZA defaults — values must match published payroll_rule_sets rows when seeded. */
const UIF_RATE_EMPLOYEE = 0.01;
const UIF_MONTHLY_CEILING = 17_712;
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Annual PAYE on cumulative taxable income (YTD + current period). */
export function estimateZaPayeCumulative(
  ytdTaxable: number,
  periodTaxable: number,
  brackets: Array<{ upTo: number | null; rate: number; base: number }>,
  rebates: { primary: number; secondary?: number; tertiary?: number },
  ageYears?: number,
): number {
  const annual = ytdTaxable + periodTaxable;
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

  const ytdAnnualTax = estimateAnnualTaxOnIncome(ytdTaxable, sorted);
  let ytdRebate = rebates.primary;
  if (ageYears != null && ageYears >= 75) ytdRebate = rebates.tertiary ?? ytdRebate;
  else if (ageYears != null && ageYears >= 65) ytdRebate = rebates.secondary ?? ytdRebate;
  const ytdTaxPaid = Math.max(0, ytdAnnualTax - ytdRebate);

  return round2(Math.max(0, annualTax - ytdTaxPaid));
}

function estimateAnnualTaxOnIncome(
  annual: number,
  sorted: Array<{ upTo: number | null; rate: number; base: number }>,
): number {
  if (annual <= 0) return 0;
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
  return tax;
}

/** Annualised PAYE estimate using SARS-style bracket bases (base = tax on income below this band). */
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
    const taxableForPaye = Math.max(0, ctx.periodGross - uif);
    lines.push({
      code: "taxable_income",
      kind: "deduction",
      amount: taxableForPaye,
      description: "Taxable income (period)",
    });
    const paye = estimateZaPayeCumulative(
      ctx.ytdTaxable,
      taxableForPaye,
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
