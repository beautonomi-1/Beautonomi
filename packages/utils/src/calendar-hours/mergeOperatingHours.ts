/**
 * §Calendar-hours engine — merge many weekly schedules into a union schedule.
 *
 * Used for:
 *   - Mobile "All Locations" overlay (so shading covers the widest open window
 *     across every location, not just the first).
 *   - Day view when a staff row has no personal `working_hours` so weekends
 *     match the week view instead of falling back to location-only hours.
 *
 * Merge semantics (per day):
 *   - If any schedule is open, the merged day is open.
 *   - `open` = earliest open minute across all open schedules for that day.
 *   - `close` = latest close minute across all open schedules for that day.
 *   - Overnight ranges are honoured: a 22:00–02:00 schedule contributes
 *     `open=22:00` and a carry forward to the next day (open at 00:00). The
 *     next day's open/close then include `00:00` as a candidate start.
 *   - If every schedule is closed or missing for a day, the merged day is
 *     `{ closed: true }`.
 *   - If no schedule contains any open day at all, returns `null` (no constraint).
 */

import {
  DAY_NAMES,
  minutesToTimeString,
  resolveDayHours,
  type DayName,
  type WeeklyHours,
} from "./resolveDayHours";

export interface MergedDayHours {
  open: string;
  close: string;
  closed: boolean;
}

export type MergedWeeklyHours = Record<DayName, MergedDayHours>;

function asWeekly(value: unknown): WeeklyHours | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as WeeklyHours;
}

export function mergeOperatingHours(
  schedules: Array<unknown> | null | undefined,
): MergedWeeklyHours | null {
  if (!schedules || schedules.length === 0) return null;
  const valid = schedules.map(asWeekly).filter((s): s is WeeklyHours => s != null);
  if (valid.length === 0) return null;

  const merged = {} as MergedWeeklyHours;

  for (let i = 0; i < DAY_NAMES.length; i++) {
    const dayName = DAY_NAMES[i] as DayName;
    const prevDayName = DAY_NAMES[(i + 6) % 7] as DayName;

    let earliest = Number.POSITIVE_INFINITY;
    let latest = Number.NEGATIVE_INFINITY;
    let anyOpen = false;

    for (const schedule of valid) {
      const today = resolveDayHours((schedule as Record<string, unknown>)[dayName]);
      const prev = resolveDayHours((schedule as Record<string, unknown>)[prevDayName]);

      if (today && !today.closed) {
        if (today.openMin !== today.closeMin) {
          anyOpen = true;
          earliest = Math.min(earliest, today.openMin);
          if (today.closeMin > today.openMin) {
            latest = Math.max(latest, today.closeMin);
          } else {
            latest = Math.max(latest, 24 * 60);
          }
        }
      }

      if (prev && !prev.closed && prev.closeMin < prev.openMin) {
        anyOpen = true;
        earliest = Math.min(earliest, 0);
        latest = Math.max(latest, prev.closeMin);
      }
    }

    if (anyOpen && Number.isFinite(earliest) && Number.isFinite(latest)) {
      merged[dayName] = {
        open: minutesToTimeString(earliest),
        close: minutesToTimeString(latest),
        closed: false,
      };
    } else {
      merged[dayName] = { open: "00:00", close: "00:00", closed: true };
    }
  }

  return merged;
}

/**
 * Variant that accepts a list of team members and merges their `working_hours`.
 * Members with no `working_hours` (undefined / empty object) are treated as
 * "follows location" and do not contribute to the merged window, matching
 * existing `mergeTeamWorkingHoursForCalendar` behaviour.
 */
export function mergeStaffWorkingHours<
  T extends { working_hours?: WeeklyHours | null },
>(members: T[]): MergedWeeklyHours | null {
  const withHours = members
    .map((m) => (m.working_hours && Object.keys(m.working_hours).length > 0 ? m.working_hours : null))
    .filter((h): h is WeeklyHours => h != null);
  if (withHours.length === 0) return null;
  return mergeOperatingHours(withHours);
}
