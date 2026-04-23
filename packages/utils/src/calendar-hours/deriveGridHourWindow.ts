/**
 * §Calendar-hours engine — derive the visible `[startHour, endHour]` for a
 * calendar grid.
 *
 * The window is the union of:
 *   1. Location operating hours across all visible days.
 *   2. Every visible staff's working hours (so a Saturday shift still shows
 *      even when the location is "closed").
 *   3. Appointments and time blocks that fall on visible dates (never clip
 *      an existing event).
 *
 * All inputs may be null/empty — callers pass whatever data is loaded. When
 * nothing is open anywhere, the result falls back to `defaultStartHour`/
 * `defaultEndHour` (web uses 8–20; mobile uses provider preferences).
 *
 * Overnight shifts contribute hours on both the opening day and the
 * wrap-around day, so a 22:00–02:00 location pushes the grid to include
 * `00–03` on the next day as well as `21–24` on the current day.
 *
 * The result is always clamped to `[0, 23]` and padded by `paddingHours`
 * (default `1`).
 */

import {
  DAY_NAMES,
  resolveDayHours,
  type DayName,
  type WeeklyHours,
} from "./resolveDayHours";
import { expandResolvedDay } from "./dayMinuteRanges";
import { formatDateKeyInTimeZone, getWeekdayInTimeZone } from "./timezone";

export interface GridHourInput {
  /** Dates that are currently visible on the grid. */
  visibleDates: Date[];
  locationOperatingHours?: WeeklyHours | null;
  staffWorkingHours?: Array<WeeklyHours | null | undefined>;
  /** Existing events on visible dates: `{ date: "YYYY-MM-DD", startMin, endMin }`. */
  events?: Array<{ date: string; startMin: number; endMin: number }>;
  defaultStartHour?: number;
  defaultEndHour?: number;
  paddingHours?: number;
  /**
   * IANA timezone used to resolve weekdays and `event.date` keys. When
   * omitted, the caller's device-local interpretation of each Date is used —
   * pass the provider's business timezone for correctness across devices.
   */
  timeZone?: string | null;
}

export interface GridHourWindow {
  startHour: number;
  endHour: number;
  hasAnyOpenSlot: boolean;
}

function asDayKey(i: number): DayName {
  return DAY_NAMES[((i % 7) + 7) % 7] as DayName;
}

function formatDateKey(d: Date, timeZone?: string | null): string {
  if (timeZone) return formatDateKeyInTimeZone(d, timeZone);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function expandFromWeekly(
  weekly: WeeklyHours | null | undefined,
  dayIndex: number,
  push: (startMin: number, endMin: number) => void,
): void {
  if (!weekly) return;
  const today = resolveDayHours((weekly as Record<string, unknown>)[asDayKey(dayIndex)]);
  const expanded = expandResolvedDay(today);
  for (const r of expanded.sameDay) push(r.startMin, r.endMin);
  const prev = resolveDayHours((weekly as Record<string, unknown>)[asDayKey(dayIndex - 1)]);
  const prevExpanded = expandResolvedDay(prev);
  if (prevExpanded.overnightTailMin > 0) push(0, prevExpanded.overnightTailMin);
}

export function deriveGridHourWindow(input: GridHourInput): GridHourWindow {
  const {
    visibleDates,
    locationOperatingHours,
    staffWorkingHours = [],
    events = [],
    defaultStartHour = 8,
    defaultEndHour = 20,
    paddingHours = 1,
    timeZone,
  } = input;

  let minMin = Number.POSITIVE_INFINITY;
  let maxMin = Number.NEGATIVE_INFINITY;
  let hasAnyOpenSlot = false;

  const push = (startMin: number, endMin: number) => {
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return;
    if (endMin <= startMin) return;
    hasAnyOpenSlot = true;
    if (startMin < minMin) minMin = startMin;
    if (endMin > maxMin) maxMin = endMin;
  };

  for (const d of visibleDates) {
    const dayIndex = timeZone ? getWeekdayInTimeZone(d, timeZone) : d.getDay();
    expandFromWeekly(locationOperatingHours, dayIndex, push);
    for (const w of staffWorkingHours) expandFromWeekly(w, dayIndex, push);
  }

  const visibleKeys = new Set(visibleDates.map((d) => formatDateKey(d, timeZone)));
  for (const ev of events) {
    if (!visibleKeys.has(ev.date)) continue;
    push(ev.startMin, ev.endMin);
  }

  let startHour: number;
  let endHour: number;
  if (hasAnyOpenSlot) {
    const startFromMin = Math.floor(minMin / 60) - paddingHours;
    const endFromMin = Math.ceil(maxMin / 60) + paddingHours;
    startHour = Math.max(0, startFromMin);
    endHour = Math.min(23, endFromMin);
  } else {
    startHour = Math.max(0, defaultStartHour);
    endHour = Math.min(23, defaultEndHour);
  }
  if (endHour < startHour) endHour = startHour;
  return { startHour, endHour, hasAnyOpenSlot };
}
