/**
 * §Calendar-hours engine — minimal, dependency-free timezone helpers.
 *
 * The engine needs to know *which weekday* a `Date` falls on in the provider's
 * business timezone (e.g. Africa/Johannesburg), because a device in UTC can
 * perceive Saturday 23:30 SAST as Saturday 21:30 UTC — the right day — but a
 * device in Honolulu perceiving the same instant sees Saturday 11:30 HST,
 * which is still Saturday. Near midnight the day can flip:
 *
 *   UTC 2026-04-18 22:30Z → Johannesburg Sun 2026-04-19 00:30 (day = Sunday)
 *                        → Honolulu     Sat 2026-04-18 12:30 (day = Saturday)
 *
 * To avoid pulling `date-fns-tz` (which isn't in this package's deps), we use
 * the built-in `Intl.DateTimeFormat` to read wall-clock parts in any IANA zone.
 */
 
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface WallClockParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  weekday: number; // 0=Sun..6=Sat
  hour: number; // 0-23
  minute: number; // 0-59
}

/**
 * Project `date` into `timeZone` and return wall-clock parts. If `timeZone` is
 * nullish or invalid, fall back to the local getters on the Date itself.
 */
export function wallClockInTimeZone(
  date: Date,
  timeZone: string | null | undefined,
): WallClockParts {
  if (!timeZone || !isValidTimeZone(timeZone)) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      weekday: date.getDay(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const weekdayStr = get("weekday");
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  let hour = Number(get("hour"));
  const minute = Number(get("minute"));
  // Intl can emit "24" for midnight under hour12:false in some engines.
  if (hour === 24) hour = 0;
  const weekday = WEEKDAY_INDEX[weekdayStr] ?? date.getDay();
  return { year, month, day, weekday, hour, minute };
}

/** Day-of-week (0=Sun..6=Sat) for `date` in `timeZone`. */
export function getWeekdayInTimeZone(
  date: Date,
  timeZone: string | null | undefined,
): number {
  return wallClockInTimeZone(date, timeZone).weekday;
}

/** YYYY-MM-DD wall-clock date key for `date` in `timeZone`. */
export function formatDateKeyInTimeZone(
  date: Date,
  timeZone: string | null | undefined,
): string {
  const { year, month, day } = wallClockInTimeZone(date, timeZone);
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Wall-clock minutes-since-midnight for `date` in `timeZone`. */
export function getWallMinutesInTimeZone(
  date: Date,
  timeZone: string | null | undefined,
): number {
  const { hour, minute } = wallClockInTimeZone(date, timeZone);
  return hour * 60 + minute;
}
