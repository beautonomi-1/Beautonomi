import {
  format,
  startOfDay,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
} from "date-fns";

/**
 * `YYYY-MM-DD` in the device local calendar — use instead of `toISOString().split("T")[0]`
 * so late-evening users don’t get the wrong day vs UTC.
 */
export function formatLocalYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Preset ranges used across provider report screens and catalog detail. */
export type ReportDateRangeKey = "today" | "week" | "month" | "last_month" | "3months";

/**
 * Inclusive local calendar dates (YYYY-MM-DD) for API `from` / `to` params.
 * Uses the device timezone — avoids UTC `toISOString()` day shifts for evening users.
 *
 * - **week**: Monday 00:00 through today (ISO week starting Monday).
 * - **month**: First day of this calendar month through today (month-to-date).
 * - **last_month**: Full previous calendar month.
 * - **3months**: Rolling 90 days ending today (inclusive).
 */
export function getReportDateRange(range: ReportDateRangeKey, now = new Date()): { from: string; to: string } {
  const today = startOfDay(now);
  const to = format(today, "yyyy-MM-dd");

  switch (range) {
    case "today":
      return { from: to, to };
    case "week": {
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      return { from: format(weekStart, "yyyy-MM-dd"), to };
    }
    case "month": {
      const monthStart = startOfMonth(today);
      return { from: format(monthStart, "yyyy-MM-dd"), to };
    }
    case "last_month": {
      const ref = subMonths(today, 1);
      const fromD = startOfMonth(ref);
      const toD = endOfMonth(ref);
      return { from: format(fromD, "yyyy-MM-dd"), to: format(toD, "yyyy-MM-dd") };
    }
    case "3months": {
      const fromD = subDays(today, 89);
      return { from: format(fromD, "yyyy-MM-dd"), to };
    }
    default:
      return { from: to, to };
  }
}

/** Short caption for filter UI, e.g. "Jan 1 – Jan 18, 2026". */
export function formatReportRangeCaption(from: string, to: string): string {
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  };
  const a = parse(from);
  const b = parse(to);
  if (from === to) return format(a, "MMM d, yyyy");
  return `${format(a, "MMM d")} – ${format(b, "MMM d, yyyy")}`;
}
