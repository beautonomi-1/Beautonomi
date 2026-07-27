import {
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";

export type ProviderFinanceRangeKey = "today" | "week" | "month" | "year" | "all";

export type ProviderFinanceRangeBounds = {
  startDate: Date;
  startIso: string;
  /**
   * Previous comparison window for growth metrics, aligned to the same elapsed
   * length as the selected range (e.g. month-to-date compares against the same
   * day span of the previous month) so growth is not skewed by a partial period.
   */
  lastPeriodStart: Date;
  lastPeriodEnd: Date;
  /** False when a like-for-like comparison is not meaningful (all time). */
  comparable: boolean;
  label: string;
  comparisonLabel: string;
};

/**
 * Calendar-based finance ranges in the provider business timezone.
 * Matches mobile Money hub chips and GET /api/provider/transactions periods.
 */
export function resolveProviderFinanceRangeBounds(
  range: string,
  timezone: string,
  now: Date = new Date(),
): ProviderFinanceRangeBounds {
  const zNow = toZonedTime(now, timezone);
  const todayYmd = formatDateYmd(now, timezone);

  if (range === "all") {
    const startDate = new Date("1970-01-01T00:00:00.000Z");
    return {
      startDate,
      startIso: "1970-01-01T00:00:00.000Z",
      lastPeriodStart: startDate,
      lastPeriodEnd: startDate,
      comparable: false,
      label: "All time",
      comparisonLabel: "no comparison period",
    };
  }

  if (range === "today") {
    const bounds = dateRangeBoundsUtc(todayYmd, todayYmd, timezone);
    const prevYmd = formatDateYmd(subDays(zNow, 1), timezone);
    const prev = dateRangeBoundsUtc(prevYmd, prevYmd, timezone);
    return {
      startDate: new Date(bounds.fromIso),
      startIso: bounds.fromIso,
      lastPeriodStart: new Date(prev.fromIso),
      lastPeriodEnd: new Date(prev.toIso),
      comparable: true,
      label: "Today",
      comparisonLabel: "yesterday",
    };
  }

  if (range === "week") {
    const weekStartYmd = formatDateYmd(startOfWeek(zNow, { weekStartsOn: 1 }), timezone);
    const bounds = dateRangeBoundsUtc(weekStartYmd, todayYmd, timezone);
    const sameDayLastWeek = subDays(zNow, 7);
    const prev = dateRangeBoundsUtc(
      formatDateYmd(startOfWeek(sameDayLastWeek, { weekStartsOn: 1 }), timezone),
      formatDateYmd(sameDayLastWeek, timezone),
      timezone,
    );
    return {
      startDate: new Date(bounds.fromIso),
      startIso: bounds.fromIso,
      lastPeriodStart: new Date(prev.fromIso),
      lastPeriodEnd: new Date(prev.toIso),
      comparable: true,
      label: "This week (Mon–today)",
      comparisonLabel: "same days last week",
    };
  }

  if (range === "year") {
    const bounds = dateRangeBoundsUtc(formatDateYmd(startOfYear(zNow), timezone), todayYmd, timezone);
    const sameDayLastYear = subYears(zNow, 1);
    const prev = dateRangeBoundsUtc(
      formatDateYmd(startOfYear(sameDayLastYear), timezone),
      formatDateYmd(sameDayLastYear, timezone),
      timezone,
    );
    return {
      startDate: new Date(bounds.fromIso),
      startIso: bounds.fromIso,
      lastPeriodStart: new Date(prev.fromIso),
      lastPeriodEnd: new Date(prev.toIso),
      comparable: true,
      label: "This year",
      comparisonLabel: "same period last year",
    };
  }

  // month (default)
  const bounds = dateRangeBoundsUtc(formatDateYmd(startOfMonth(zNow), timezone), todayYmd, timezone);
  const sameDayLastMonth = subMonths(zNow, 1);
  const prev = dateRangeBoundsUtc(
    formatDateYmd(startOfMonth(sameDayLastMonth), timezone),
    formatDateYmd(sameDayLastMonth, timezone),
    timezone,
  );
  return {
    startDate: new Date(bounds.fromIso),
    startIso: bounds.fromIso,
    lastPeriodStart: new Date(prev.fromIso),
    lastPeriodEnd: new Date(prev.toIso),
    comparable: true,
    label: "This month",
    comparisonLabel: "same days last month",
  };
}
