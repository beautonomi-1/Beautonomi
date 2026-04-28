import { format } from "date-fns";

/** Date range used for front-desk metric cards and booking lists (web + provider app). */
export type FrontDeskMetricRange = "all" | "today" | "week" | "month" | "year";

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

/**
 * Calendar window for API `start_date` / `end_date` (inclusive local calendar days).
 * `all` uses the last 90 days ending on the anchor day so queries stay bounded.
 */
export function getMetricRangeParams(
  range: FrontDeskMetricRange | undefined,
  anchorDate: Date,
): { start?: string; end?: string } {
  const selected = range ?? "today";
  if (selected === "all") {
    const end = new Date(anchorDate);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 89);
    return { start: formatYmd(start), end: formatYmd(end) };
  }

  const start = new Date(anchorDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);

  if (selected === "week") {
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (selected === "month") {
    start.setDate(1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
  } else if (selected === "year") {
    start.setMonth(0, 1);
    end.setFullYear(start.getFullYear(), 11, 31);
  }

  return { start: formatYmd(start), end: formatYmd(end) };
}

/** Human-readable label for the booking list / metrics window. */
export function formatFrontDeskRangeCaption(
  metricRange: FrontDeskMetricRange | undefined,
  anchorDate: Date,
): string {
  const selected = metricRange ?? "today";
  const { start, end } = getMetricRangeParams(selected, anchorDate);
  if (!start || !end) return format(anchorDate, "EEEE, MMMM d, yyyy");
  const startD = parseLocalYmd(start);
  const endD = parseLocalYmd(end);
  if (start === end) return format(startD, "EEEE, MMMM d, yyyy");
  return `${format(startD, "MMM d, yyyy")} – ${format(endD, "MMM d, yyyy")}`;
}
