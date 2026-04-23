/**
 * §Calendar-hours engine
 *
 * Single source of truth for turning the platform's weekly operating-hours
 * / working-hours shapes into minute ranges, union schedules, slot inside/
 * outside checks, and grid start/end hour derivation.
 *
 * Consumers:
 *   - `apps/web` provider portal calendar (utils.ts re-exports + CalendarClient)
 *   - `apps/provider` mobile calendar tab
 */

export {
  DAY_NAMES,
  minutesToTimeString,
  resolveDayHours,
  resolveWeeklyDay,
  timeStringToMinutes,
  type DayName,
  type ResolvedDayHours,
  type WeeklyHours,
} from "./resolveDayHours";

export {
  dayMinuteRanges,
  dayMinuteRangesFromDayHours,
  expandResolvedDay,
  mergeRanges,
  type MinuteRange,
} from "./dayMinuteRanges";

export {
  hourIsOutsideWeekly,
  slotIsInsideRanges,
  slotIsOutsideWeekly,
  slotOverlapsRanges,
} from "./slotIsInside";

export {
  mergeOperatingHours,
  mergeStaffWorkingHours,
  type MergedDayHours,
  type MergedWeeklyHours,
} from "./mergeOperatingHours";

export {
  deriveGridHourWindow,
  type GridHourInput,
  type GridHourWindow,
} from "./deriveGridHourWindow";

export {
  formatDateKeyInTimeZone,
  getWallMinutesInTimeZone,
  getWeekdayInTimeZone,
  wallClockInTimeZone,
  type WallClockParts,
} from "./timezone";
