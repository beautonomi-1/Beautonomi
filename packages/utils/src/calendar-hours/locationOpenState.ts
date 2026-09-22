import {
  DAY_NAMES,
  resolveWeeklyDay,
  type DayName,
  type WeeklyHours,
} from "./resolveDayHours";
import { dayMinuteRanges } from "./dayMinuteRanges";
import { getWallMinutesInTimeZone, getWeekdayInTimeZone } from "./timezone";

export type LocationHoursDayStatus = "open" | "closed" | "unknown";

export interface LocationOpenState {
  status: "open" | "closed" | "unknown";
  /** Minutes until close today when status is open (same-day segment only). */
  closeMin?: number;
  /** Next opening day index 0=Sun..6=Sat when closed and a future open day exists. */
  nextOpenDay?: DayName;
  nextOpenMin?: number;
}

export interface WeeklyHoursRow {
  day: DayName;
  status: LocationHoursDayStatus;
  openMin?: number;
  closeMin?: number;
}

function normalizeWeeklyHours(input: unknown): WeeklyHours | null {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return null;
  const keys = Object.keys(input as object);
  if (keys.length === 0) return null;
  return input as WeeklyHours;
}

function hasAnyScheduledHours(weekly: WeeklyHours): boolean {
  for (const day of DAY_NAMES) {
    const resolved = resolveWeeklyDay(weekly, DAY_NAMES.indexOf(day));
    if (resolved && !resolved.closed) return true;
  }
  return false;
}

function isOpenAtMinute(nowMin: number, ranges: { startMin: number; endMin: number }[]): boolean {
  return ranges.some((r) => nowMin >= r.startMin && nowMin < r.endMin);
}

function findNextOpen(
  weekly: WeeklyHours,
  fromWeekday: number,
  timeZone: string | null | undefined,
): { day: DayName; openMin: number } | null {
  for (let offset = 1; offset <= 7; offset++) {
    const dayIndex = (fromWeekday + offset) % 7;
    const day = DAY_NAMES[dayIndex];
    const resolved = resolveWeeklyDay(weekly, dayIndex);
    if (resolved && !resolved.closed && resolved.openMin < resolved.closeMin) {
      return { day, openMin: resolved.openMin };
    }
    if (resolved && !resolved.closed && resolved.closeMin <= resolved.openMin) {
      // Overnight opens previous evening — for "next open" use openMin on that day
      return { day, openMin: resolved.openMin };
    }
  }
  void timeZone;
  return null;
}

/**
 * Structured open/closed state for a provider location's working_hours JSON.
 * Uses provider IANA timezone for "now". No display strings — UI/i18n formats output.
 */
export function getLocationOpenState(
  workingHours: unknown,
  now: Date = new Date(),
  timeZone: string | null | undefined = "Africa/Johannesburg",
): LocationOpenState {
  const weekly = normalizeWeeklyHours(workingHours);
  if (!weekly || !hasAnyScheduledHours(weekly)) {
    return { status: "unknown" };
  }

  const nowMin = getWallMinutesInTimeZone(now, timeZone);
  const weekday = getWeekdayInTimeZone(now, timeZone);
  const ranges = dayMinuteRanges(now, weekly, timeZone);

  if (ranges.length === 0) {
    const next = findNextOpen(weekly, weekday, timeZone);
    if (next) {
      return { status: "closed", nextOpenDay: next.day, nextOpenMin: next.openMin };
    }
    return { status: "unknown" };
  }

  if (isOpenAtMinute(nowMin, ranges)) {
    const containing = ranges.find((r) => nowMin >= r.startMin && nowMin < r.endMin);
    return {
      status: "open",
      closeMin: containing?.endMin,
    };
  }

  const todayResolved = resolveWeeklyDay(weekly, weekday);
  if (todayResolved && !todayResolved.closed) {
    if (nowMin < todayResolved.openMin) {
      return {
        status: "closed",
        nextOpenDay: DAY_NAMES[weekday],
        nextOpenMin: todayResolved.openMin,
      };
    }
  }

  const next = findNextOpen(weekly, weekday, timeZone);
  if (next) {
    return { status: "closed", nextOpenDay: next.day, nextOpenMin: next.openMin };
  }
  return { status: "unknown" };
}

/** Per-day schedule rows for order detail / expanded hours UI. */
export function getWeeklyHoursRows(workingHours: unknown): WeeklyHoursRow[] {
  const weekly = normalizeWeeklyHours(workingHours);
  if (!weekly) {
    return DAY_NAMES.map((day) => ({ day, status: "unknown" as const }));
  }

  return DAY_NAMES.map((day, index) => {
    const resolved = resolveWeeklyDay(weekly, index);
    if (!resolved) return { day, status: "unknown" as const };
    if (resolved.closed) return { day, status: "closed" as const };
    return {
      day,
      status: "open" as const,
      openMin: resolved.openMin,
      closeMin: resolved.closeMin,
    };
  });
}
