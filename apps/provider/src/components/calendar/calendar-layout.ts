/**
 * Shared layout math for the provider calendar grid (slot alignment, block height).
 * Keep in sync with {@link CurrentTimeIndicator} vertical offset.
 */
import { getHours, getMinutes, parseISO } from "date-fns";
import type { Booking, CalendarBooking } from "@/components/calendar/calendar-booking-types";

/** Grid top padding — must match `CurrentTimeIndicator` and day column padding. */
export const CALENDAR_GRID_TOP_PADDING = 8;

/** True when the string already carries an explicit ISO-8601 offset or Zulu suffix. */
function hasExplicitTimeZone(iso: string): boolean {
  if (/Z$/i.test(iso)) return true;
  // +hh:mm, -hh:mm, +hhmm, -hhmm at end of string
  return /[+-]\d{2}:\d{2}(:\d{2})?$/.test(iso) || /[+-]\d{4}$/.test(iso);
}

/**
 * Parse API datetime strings for calendar layout.
 * Naive ISO strings (no zone) are treated as UTC so positioning matches
 * `formatTimeInZone` / server TIMESTAMPTZ, not the device local zone.
 */
export function parseApiDateTime(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const normalised = hasExplicitTimeZone(trimmed) ? trimmed : `${trimmed}Z`;
  const parsed = parseISO(normalised);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * Wall-clock hour/minute for an instant in the business IANA zone.
 * Falls back to the device local clock when no zone is set.
 */
export function getHourMinuteForInstantInZone(
  instant: Date,
  timeZone: string | null | undefined,
): { h: number; m: number } {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(instant);
      return {
        h: Number(parts.find((p) => p.type === "hour")?.value ?? getHours(instant)),
        m: Number(parts.find((p) => p.type === "minute")?.value ?? getMinutes(instant)),
      };
    } catch {
      /* fall through */
    }
  }
  return { h: getHours(instant), m: getMinutes(instant) };
}

/**
 * Converts Y offset in calendar scroll content to hour/minute, aligned with
 * {@link CalendarDayGridColumn}: rowHeight = (timeIncrementMinutes/60) * slotHeightPerHour,
 * first interactive row at `gridTopPadding`.
 */
export function contentYOffsetToHourMinute(args: {
  contentY: number;
  gridTopPadding: number;
  startHour: number;
  endHour: number;
  slotHeightPerHour: number;
  timeIncrementMinutes: number;
}): { hour: number; minute: number } {
  const {
    contentY,
    gridTopPadding,
    startHour,
    endHour,
    slotHeightPerHour,
    timeIncrementMinutes,
  } = args;
  const inc = Math.max(1, Math.min(60, timeIncrementMinutes));
  const slotH =
    Number.isFinite(slotHeightPerHour) && slotHeightPerHour > 0 ? slotHeightPerHour : 60;
  const rowHeight = (inc / 60) * slotH;
  const offset = contentY - gridTopPadding;
  if (!Number.isFinite(offset) || rowHeight <= 0) {
    return { hour: startHour, minute: 0 };
  }
  const rowIndex = Math.max(0, offset / rowHeight);
  let totalMinFromMidnight = startHour * 60 + rowIndex * inc;
  const gridEndMin = (endHour + 1) * 60;
  totalMinFromMidnight = Math.min(Math.max(0, totalMinFromMidnight), gridEndMin - inc);
  const hour = Math.floor(totalMinFromMidnight / 60);
  const minuteRaw = totalMinFromMidnight % 60;
  const minute = Math.round(minuteRaw / inc) * inc;
  return {
    hour: Math.min(23, Math.max(0, hour)),
    minute: Math.min(59, Math.max(0, minute)),
  };
}

export function getTopOffset(
  timeStr: string,
  startHour: number,
  slotHeight: number,
): number {
  if (!timeStr) return 0;

  let h = 0;
  let m = 0;

  if (timeStr.includes("T")) {
    const timePart = timeStr.split("T")[1];
    if (timePart) {
      const match = timePart.match(/^(\d{2}):(\d{2})/);
      if (match) {
        h = parseInt(match[1], 10);
        m = parseInt(match[2], 10);
      }
    }
  } else {
    const match = timeStr.match(/^(\d{2}):(\d{2})/);
    if (match) {
      h = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
    }
  }

  const slot = Number.isFinite(slotHeight) && slotHeight > 0 ? slotHeight : 60;
  const safeStart = Number.isFinite(startHour) ? startHour : 0;
  const hourN = Number.isFinite(h) ? h : 0;
  const minN = Number.isFinite(m) ? m : 0;
  const out = (hourN - safeStart) * slot + (minN / 60) * slot;
  return Math.max(0, Number.isFinite(out) ? out : 0);
}

export function getBlockHeight(booking: Booking | CalendarBooking, slotHeight: number, compact: boolean): number {
  const rawTotal =
    booking.services?.reduce((s, svc) => {
      const n = Number(svc?.duration_minutes);
      return s + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0) ?? 0;
  const totalMin = rawTotal > 0 ? rawTotal : 30;
  const slot = Number.isFinite(slotHeight) && slotHeight > 0 ? slotHeight : 60;
  const raw = (totalMin / 60) * slot;
  const minH = compact ? slot / 6 : slot / 4;
  const out = Math.max(raw, minH);
  return Number.isFinite(out) ? out : minH;
}

/** Calendar `YYYY-MM-DD` arithmetic in UTC (safe for day-key windows; not wall-clock instants). */
export function addCalendarDaysToDateKey(key: string, delta: number): string {
  const [y, mo, da] = key.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return key;
  const dt = new Date(Date.UTC(y, mo - 1, da + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
