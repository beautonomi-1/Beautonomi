/**
 * Shared layout math for the provider calendar grid (slot alignment, block height).
 * Keep in sync with {@link CurrentTimeIndicator} vertical offset.
 */
import { getHours, getMinutes, parseISO } from "date-fns";
import type { Booking, CalendarBooking } from "@/components/calendar/calendar-booking-types";

/** Grid top padding — must match `CurrentTimeIndicator` and day column padding. */
export const CALENDAR_GRID_TOP_PADDING = 8;

export function parseApiDateTime(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = parseISO(value);
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

export function getTopOffset(
  dateStr: string,
  startHour: number,
  slotHeight: number,
  timeZone?: string | null,
): number {
  const d = parseApiDateTime(dateStr);
  if (!d) return 0;
  const { h, m } = getHourMinuteForInstantInZone(d, timeZone);
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
