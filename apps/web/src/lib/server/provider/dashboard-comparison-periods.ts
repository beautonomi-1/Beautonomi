import { differenceInCalendarDays, format, subMonths } from "date-fns";
import { addDaysToYmd, dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";

export type ComparisonPeriodBounds = {
  start: Date;
  end: Date;
  label: string;
};

/**
 * Prior-week window aligned to the same number of elapsed days as the current
 * partial week (week start → today), shifted back one week.
 */
export function getPriorWeekComparisonBounds(params: {
  timezone: string;
  businessNow: Date;
  startOfWeekLocal: Date;
}): ComparisonPeriodBounds {
  const { timezone, businessNow, startOfWeekLocal } = params;
  const weekStartYmd = formatDateYmd(startOfWeekLocal, timezone);
  const todayYmd = formatDateYmd(businessNow, timezone);
  const daysIntoWeek = Math.max(
    0,
    differenceInCalendarDays(
      new Date(`${todayYmd}T12:00:00`),
      new Date(`${weekStartYmd}T12:00:00`),
    ),
  );
  const priorWeekStartYmd = addDaysToYmd(weekStartYmd, -7);
  const priorWeekEndYmd = addDaysToYmd(priorWeekStartYmd, daysIntoWeek);
  const bounds = dateRangeBoundsUtc(priorWeekStartYmd, priorWeekEndYmd, timezone);
  return {
    start: new Date(bounds.fromIso),
    end: new Date(bounds.toIso),
    label: "last week (same days)",
  };
}

/**
 * Prior-month MTD window: first day of last calendar month through the same
 * civil day last month (e.g. Jun 1–5 vs May 1–5).
 */
export function getPriorMonthMtdComparisonBounds(params: {
  timezone: string;
  businessNow: Date;
}): ComparisonPeriodBounds {
  const { timezone, businessNow } = params;
  const priorMonthStartYmd = format(
    new Date(businessNow.getFullYear(), businessNow.getMonth() - 1, 1),
    "yyyy-MM-dd",
  );
  const priorMonthEndYmd = formatDateYmd(subMonths(businessNow, 1), timezone);
  const bounds = dateRangeBoundsUtc(priorMonthStartYmd, priorMonthEndYmd, timezone);
  return {
    start: new Date(bounds.fromIso),
    end: new Date(bounds.toIso),
    label: "last month (to date)",
  };
}
