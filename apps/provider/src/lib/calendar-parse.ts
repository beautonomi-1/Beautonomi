import { parseISO } from "date-fns";
import { buildZonedIsoForWallClock } from "@/lib/tz";

/**
 * Parse calendar date strings for provider TZ — aligned with `formatDateKeyInTimeZone`.
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
