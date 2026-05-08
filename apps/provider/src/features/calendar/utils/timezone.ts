import { format } from "date-fns";
import { parseISO } from "date-fns";
import { formatDateKeyInTimeZone, wallClockInTimeZone } from "@beautonomi/utils";
import { buildZonedIsoForWallClock } from "@/lib/tz";

/**
 * Parse `?date=` deep links. When `providerTimezone` is set, `YYYY-MM-DD` is interpreted as that
 * zone's wall calendar date.
 */
export function parseCalendarDateParam(value: string, providerTimezone?: string | null): Date | null {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (match && providerTimezone) {
    try {
      const iso = buildZonedIsoForWallClock(trimmed, "12:00", providerTimezone);
      const d = parseISO(iso);
      return Number.isFinite(d.getTime()) ? d : null;
    } catch {
      /* fall through */
    }
  }
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d);
    }
  }
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function calendarDateKey(day: Date, timeZone?: string | null): string {
  return timeZone ? formatDateKeyInTimeZone(day, timeZone) : format(day, "yyyy-MM-dd");
}

export function currentWallClockTimeInZone(timeZone?: string | null): string {
  const { hour, minute } = wallClockInTimeZone(new Date(), timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
