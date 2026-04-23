/**
 * §Calendar-hours engine
 *
 * Normalizes the many historical operating-hours shapes the platform has accumulated
 * into a single, minute-based representation:
 *
 *   - `{ open, close, closed }`             (modern web shape)
 *   - `{ open_time, close_time, is_open }`  (modern mobile shape)
 *   - `{ start, end }`                      (legacy)
 *   - `{ start_time, end_time }`            (legacy)
 *
 * Returning minutes rather than strings removes the need for every caller to re-parse
 * `"HH:MM"` and ensures overnight detection (close <= open) has a single source of truth.
 */

export interface ResolvedDayHours {
  openMin: number;
  closeMin: number;
  closed: boolean;
}

export const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type DayName = (typeof DAY_NAMES)[number];

export type WeeklyHours = Partial<Record<DayName, unknown>>;

export function timeStringToMinutes(t: string | undefined | null): number | null {
  if (t == null || typeof t !== "string") return null;
  const parts = t.trim().split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const hh = Math.max(0, Math.min(23, Math.trunc(h)));
  const mm = Math.max(0, Math.min(59, Math.trunc(m)));
  return hh * 60 + mm;
}

export function minutesToTimeString(total: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.trunc(total)));
  const hh = Math.floor(safe / 60);
  const mm = safe % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Resolve any known day-hours shape into `{ openMin, closeMin, closed }`.
 * Returns `null` when the shape is unrecognisable so callers can distinguish
 * "no data" from "explicitly closed".
 */
export function resolveDayHours(dayHours: unknown): ResolvedDayHours | null {
  if (dayHours == null || typeof dayHours !== "object" || Array.isArray(dayHours)) {
    return null;
  }
  const raw = dayHours as Record<string, unknown>;

  const hasClosed = raw.closed !== undefined;
  const hasIsOpen = raw.is_open !== undefined;
  const closedFlag = hasClosed
    ? raw.closed === true
    : hasIsOpen
      ? raw.is_open === false
      : false;

  const pickString = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
    return undefined;
  };

  const openStr = pickString("open", "open_time", "start_time", "start");
  const closeStr = pickString("close", "close_time", "end_time", "end");

  const openMin = timeStringToMinutes(openStr);
  const closeMin = timeStringToMinutes(closeStr);

  if (closedFlag) {
    return { openMin: 0, closeMin: 0, closed: true };
  }

  if (openMin == null || closeMin == null) {
    return null;
  }

  return { openMin, closeMin, closed: false };
}

/** Look up a day entry from a weekly schedule map by JS `Date.getDay()` index (0=sunday). */
export function resolveWeeklyDay(
  weekly: WeeklyHours | null | undefined,
  dayIndex: number,
): ResolvedDayHours | null {
  if (!weekly || typeof weekly !== "object") return null;
  const key = DAY_NAMES[((dayIndex % 7) + 7) % 7];
  return resolveDayHours((weekly as Record<string, unknown>)[key]);
}
