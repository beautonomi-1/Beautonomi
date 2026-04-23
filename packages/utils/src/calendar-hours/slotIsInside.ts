/**
 * §Calendar-hours engine — minute-accurate slot-availability checks.
 *
 * Replaces hour-bucketed checks (`slotMin = hour * 60`) so a 09:30 open is
 * correctly considered "inside" for a 09:30 slot but "outside" for an 08:00 slot.
 */

import { dayMinuteRanges, type MinuteRange } from "./dayMinuteRanges";
import type { WeeklyHours } from "./resolveDayHours";

/** True if `[slotStartMin, slotEndMin)` is fully inside any single range. */
export function slotIsInsideRanges(
  slotStartMin: number,
  slotEndMin: number,
  ranges: MinuteRange[],
): boolean {
  if (slotEndMin <= slotStartMin) return false;
  for (const r of ranges) {
    if (slotStartMin >= r.startMin && slotEndMin <= r.endMin) return true;
  }
  return false;
}

/** True if any portion of `[slotStartMin, slotEndMin)` overlaps any range. */
export function slotOverlapsRanges(
  slotStartMin: number,
  slotEndMin: number,
  ranges: MinuteRange[],
): boolean {
  if (slotEndMin <= slotStartMin) return false;
  for (const r of ranges) {
    if (slotStartMin < r.endMin && slotEndMin > r.startMin) return true;
  }
  return false;
}

/**
 * Is the slot outside *all* open ranges for the weekly schedule on `date`?
 * - `weekly == null/undefined` → no constraint → returns `false` (treat as open).
 * - `mode === "strict"` (default) → returns `true` when the slot is not *fully*
 *   contained in any range. Use for minute-precise interior slots (e.g. a 15-min
 *   slot at 09:30 when open is 09:30).
 * - `mode === "overlap"` → returns `true` only when the slot has no overlap with
 *   any open range. Use for hour-row shading where a 09:00–10:00 block should be
 *   treated as "open" when the business opens at 09:30.
 */
export function slotIsOutsideWeekly(
  date: Date,
  slotStartMin: number,
  slotEndMin: number,
  weekly: WeeklyHours | null | undefined,
  mode: "strict" | "overlap" = "strict",
  timeZone?: string | null,
): boolean {
  if (!weekly) return false;
  const ranges = dayMinuteRanges(date, weekly, timeZone);
  if (ranges.length === 0) return true;
  if (mode === "overlap") {
    return !slotOverlapsRanges(slotStartMin, slotEndMin, ranges);
  }
  return !slotIsInsideRanges(slotStartMin, slotEndMin, ranges);
}

/**
 * Hour-row shading helper (replaces legacy `isOutside*Hours` bucket checks).
 * Returns true only when the business has *no overlap* with the `[hour, hour+1)`
 * window, so a 09:30 open leaves the 09:00 row clickable.
 */
export function hourIsOutsideWeekly(
  date: Date,
  hour: number,
  weekly: WeeklyHours | null | undefined,
  timeZone?: string | null,
): boolean {
  const startMin = hour * 60;
  const endMin = startMin + 60;
  return slotIsOutsideWeekly(date, startMin, endMin, weekly, "overlap", timeZone);
}
