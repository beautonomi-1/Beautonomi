import { differenceInCalendarDays, endOfMonth, isSameMonth, startOfMonth } from "date-fns";

export type PayPeriodType = "weekly" | "biweekly" | "semi_monthly" | "monthly" | "custom";

export type EmploymentWindow = {
  employmentStart?: string | null;
  employmentEnd?: string | null;
};

const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function clipPeriodToEmployment(
  periodStart: string,
  periodEnd: string,
  employment: EmploymentWindow,
): { start: string; end: string; payableDays: number } {
  let start = periodStart;
  let end = periodEnd;
  if (employment.employmentStart && employment.employmentStart > start) {
    start = employment.employmentStart;
  }
  if (employment.employmentEnd && employment.employmentEnd < end) {
    end = employment.employmentEnd;
  }
  if (end < start) {
    return { start, end, payableDays: 0 };
  }
  const payableDays = differenceInCalendarDays(parseYmd(end), parseYmd(start)) + 1;
  return { start, end, payableDays };
}

/**
 * Prorate monthly salary for arbitrary pay periods.
 * Full calendar month → full salary; otherwise salary * 12/365 * payable days (clipped to employment).
 */
export function prorateMonthlySalary(
  monthlySalary: number,
  periodStart: string,
  periodEnd: string,
  employment: EmploymentWindow = {},
): number {
  if (monthlySalary <= 0) return 0;

  const { start, end, payableDays } = clipPeriodToEmployment(
    periodStart,
    periodEnd,
    employment,
  );
  if (payableDays <= 0) return 0;

  const ps = parseYmd(start);
  const pe = parseYmd(end);
  const fullMonth =
    isSameMonth(ps, pe) &&
    start === formatYmd(startOfMonth(ps)) &&
    end === formatYmd(endOfMonth(pe));

  if (fullMonth) return roundMoney(monthlySalary);

  const daily = (monthlySalary * 12) / 365;
  return roundMoney(daily * payableDays);
}

export function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** @deprecated Use prorateMonthlySalary — kept for transitional callers. */
export function legacyWeeklySalarySlice(monthlySalary: number, periodType: PayPeriodType): number {
  if (monthlySalary <= 0) return 0;
  if (periodType === "monthly") return monthlySalary;
  return monthlySalary / 4;
}
