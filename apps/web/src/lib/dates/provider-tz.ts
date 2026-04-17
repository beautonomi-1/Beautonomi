/**
 * Provider-timezone-aware date utilities.
 *
 * The "business timezone" (IANA, e.g. "Africa/Johannesburg") is stored on the
 * provider row and exposed via useProviderPortal().provider.timezone.
 *
 * These helpers convert between UTC instants and the provider's wall-clock
 * dates/times so that calendar grids, day boundaries, and "now" indicators
 * align with the salon's clock — even when the browser is in a different zone.
 */

import { toZonedTime, fromZonedTime, format as formatTz } from "date-fns-tz";
import {
  startOfWeek,
  endOfWeek,
  isSameDay as dfIsSameDay,
  getDay,
  getHours,
  getMinutes,
  type Day,
} from "date-fns";

export const DEFAULT_TZ = "Africa/Johannesburg";
const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidDateValue(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

function buildLocalDateFromYmd(
  ymd: string,
  hour: number,
  minute: number,
  second: number,
  ms: number,
): Date | null {
  if (!YMD_PATTERN.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(y, m - 1, d, hour, minute, second, ms);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
}

/** Resolve the effective timezone string, falling back to Africa/Johannesburg. */
export function resolveTz(tz: string | undefined | null): string {
  const trimmed = tz?.trim();
  if (!trimmed) return DEFAULT_TZ;
  return isValidTimezone(trimmed) ? trimmed : DEFAULT_TZ;
}

/**
 * Get the current instant projected into the business timezone.
 * Use this instead of `new Date()` wherever you need "now in the salon's clock".
 */
export function nowInTz(tz: string): Date {
  return toZonedTime(new Date(), tz);
}

/**
 * Convert a UTC Date to a "zoned" Date that has wall-clock values in `tz`.
 * The returned Date's `.getHours()`, `.getDay()`, etc. reflect the business tz.
 */
export function toBusinessTime(utcDate: Date, tz: string): Date {
  return toZonedTime(utcDate, tz);
}

/**
 * Build a UTC Date from wall-clock values expressed in the business timezone.
 * For example, "2026-04-04 09:00 in Africa/Johannesburg" → the correct UTC instant.
 */
export function fromBusinessTime(zonedDate: Date, tz: string): Date {
  return fromZonedTime(zonedDate, tz);
}

/**
 * Format a date using the business timezone.
 * Thin wrapper around date-fns-tz `format`.
 */
export function formatInTz(
  date: Date | number,
  fmt: string,
  tz: string,
): string {
  return formatTz(toZonedTime(date, tz), fmt, { timeZone: tz });
}

/**
 * Build ISO date-range boundaries (YYYY-MM-DDTHH:mm:ss.sssZ) for API queries.
 * Correctly uses the business timezone so "today" and week/month boundaries
 * match the salon's wall-clock, not the browser's.
 */
export function dateRangeBoundsUtc(
  dateFrom: string,
  dateTo: string,
  tz: string,
): { fromIso: string; toIso: string } {
  const safeTz = resolveTz(tz);
  const today = new Date().toISOString().slice(0, 10);
  const safeFrom = YMD_PATTERN.test(dateFrom) ? dateFrom : today;
  const safeTo = YMD_PATTERN.test(dateTo) ? dateTo : today;

  const utcFallbackStart = new Date(`${today}T00:00:00.000Z`);
  const utcFallbackEnd = new Date(`${today}T23:59:59.999Z`);

  try {
    const startLocal = buildLocalDateFromYmd(safeFrom, 0, 0, 0, 0);
    const endLocal = buildLocalDateFromYmd(safeTo, 23, 59, 59, 999);
    if (!startLocal || !endLocal) throw new RangeError("Invalid date inputs");

    const start = fromZonedTime(startLocal, safeTz);
    const end = fromZonedTime(endLocal, safeTz);

    if (!isValidDateValue(start) || !isValidDateValue(end)) {
      throw new RangeError("Invalid zoned date conversion");
    }

    return { fromIso: start.toISOString(), toIso: end.toISOString() };
  } catch {
    const fallbackStartLocal = buildLocalDateFromYmd(today, 0, 0, 0, 0);
    const fallbackEndLocal = buildLocalDateFromYmd(today, 23, 59, 59, 999);
    if (!fallbackStartLocal || !fallbackEndLocal) {
      return { fromIso: utcFallbackStart.toISOString(), toIso: utcFallbackEnd.toISOString() };
    }

    const fallbackStart = fromZonedTime(fallbackStartLocal, safeTz);
    const fallbackEnd = fromZonedTime(fallbackEndLocal, safeTz);

    if (!isValidDateValue(fallbackStart) || !isValidDateValue(fallbackEnd)) {
      return { fromIso: utcFallbackStart.toISOString(), toIso: utcFallbackEnd.toISOString() };
    }

    return { fromIso: fallbackStart.toISOString(), toIso: fallbackEnd.toISOString() };
  }
}

/**
 * Format a Date as YYYY-MM-DD in the business timezone.
 */
export function formatDateYmd(date: Date, tz: string): string {
  return formatInTz(date, "yyyy-MM-dd", tz);
}

/** Is the given date "today" in the business timezone? */
export function isTodayInTz(date: Date, tz: string): boolean {
  const zonedDate = toZonedTime(date, tz);
  const zonedNow = toZonedTime(new Date(), tz);
  return dfIsSameDay(zonedDate, zonedNow);
}

/** Are two dates on the same calendar day in the business timezone? */
export function isSameDayInTz(a: Date, b: Date, tz: string): boolean {
  return dfIsSameDay(toZonedTime(a, tz), toZonedTime(b, tz));
}

/** Get current hour in the business timezone. */
export function currentHourInTz(tz: string): number {
  return getHours(toZonedTime(new Date(), tz));
}

/** Get current minute in the business timezone. */
export function currentMinuteInTz(tz: string): number {
  return getMinutes(toZonedTime(new Date(), tz));
}

/** Get the day-of-week (0=Sun … 6=Sat) for a date in the business timezone. */
export function getDayInTz(date: Date, tz: string): number {
  return getDay(toZonedTime(date, tz));
}

/** Start of week (Monday) for a date in the business timezone. */
export function startOfWeekInTz(
  date: Date,
  tz: string,
  weekStartsOn: Day = 1,
): Date {
  return startOfWeek(toZonedTime(date, tz), { weekStartsOn });
}

/** End of week for a date in the business timezone. */
export function endOfWeekInTz(
  date: Date,
  tz: string,
  weekStartsOn: Day = 1,
): Date {
  return endOfWeek(toZonedTime(date, tz), { weekStartsOn });
}
