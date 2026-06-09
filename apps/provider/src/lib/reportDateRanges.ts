import { format, startOfWeek, startOfMonth, endOfMonth, subMonths, subDays } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

/**
 * Preset ranges used across provider report screens and catalog detail.
 * Boundaries follow the **provider business timezone** (`/api/provider/profile`.timezone)
 * when supplied — matching GET `/api/provider/reports/*` which parses `from`/`to` in that zone.
 */
export type ReportDateRangeKey = "today" | "week" | "month" | "last_month" | "3months";

const DEFAULT_TZ = "Africa/Johannesburg";

/** `YYYY-MM-DD` in the device local calendar (non-report flows). */
export function formatLocalYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Resolve IANA timezone; invalid or missing values fall back to regional default (same spirit as web `resolveTz`). */
export function resolveReportTimezone(tz: string | null | undefined): string {
  const t = typeof tz === "string" ? tz.trim() : "";
  if (!t) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: t });
    return t;
  } catch {
    return DEFAULT_TZ;
  }
}

function formatYmdInTz(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "yyyy-MM-dd");
}

/**
 * Inclusive local calendar dates (`YYYY-MM-DD`) for API `from` / `to` params.
 *
 * - **week**: Monday 00:00 through today (ISO week starting Monday), in business TZ.
 * - **month**: First day of this calendar month through today (month-to-date).
 * - **last_month**: Full previous calendar month.
 * - **3months**: Rolling 90 days ending today (inclusive).
 */
export function getReportDateRange(
  range: ReportDateRangeKey,
  options?: { now?: Date; timezone?: string | null },
): { from: string; to: string } {
  const tz = resolveReportTimezone(options?.timezone);
  const now = options?.now ?? new Date();
  const zNow = toZonedTime(now, tz);
  const todayYmd = formatYmdInTz(now, tz);

  switch (range) {
    case "today":
      return { from: todayYmd, to: todayYmd };
    case "week": {
      const weekStart = startOfWeek(zNow, { weekStartsOn: 1 });
      return { from: formatYmdInTz(weekStart, tz), to: todayYmd };
    }
    case "month": {
      const monthStart = startOfMonth(zNow);
      return { from: formatYmdInTz(monthStart, tz), to: todayYmd };
    }
    case "last_month": {
      const ref = subMonths(zNow, 1);
      const fromD = startOfMonth(ref);
      const toD = endOfMonth(ref);
      return { from: formatYmdInTz(fromD, tz), to: formatYmdInTz(toD, tz) };
    }
    case "3months": {
      const fromD = subDays(zNow, 89);
      return { from: formatYmdInTz(fromD, tz), to: todayYmd };
    }
    default:
      return { from: todayYmd, to: todayYmd };
  }
}

/** Short caption for filter UI, e.g. "Jan 1 – Jan 18, 2026". */
export function formatReportRangeCaption(from: string, to: string): string {
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    // Anchor at local noon: the caption only renders the literal Y/M/D, and
    // midnight construction can roll back a day under a backward DST shift.
    return new Date(y!, m! - 1, d!, 12);
  };
  const a = parse(from);
  const b = parse(to);
  if (from === to) return format(a, "MMM d, yyyy");
  return `${format(a, "MMM d")} – ${format(b, "MMM d, yyyy")}`;
}
