/**
 * Vertical layout math for the provider calendar — extends {@link calendar-layout}.
 */
import {
  CALENDAR_GRID_TOP_PADDING,
  contentYOffsetToHourMinute,
  getBlockHeight,
  getTopOffset,
  getHourMinuteForInstantInZone,
} from "@/components/calendar/calendar-layout";
import type { Booking, CalendarBooking } from "@/components/calendar/calendar-booking-types";

export { CALENDAR_GRID_TOP_PADDING, contentYOffsetToHourMinute, getBlockHeight, getTopOffset, getHourMinuteForInstantInZone };

export interface PositioningContext {
  startHour: number;
  endHour: number;
  slotHeightPerHour: number;
  timeIncrementMinutes: number;
  gridTopPadding: number;
  staffHeaderHeight: number;
  providerTimezone: string | null;
}

/**
 * Returns the absolute Y offset (px) for a given wall-clock time string ("HH:mm").
 * Plan spec: `getBlockTop(timeStr, ctx)`.
 */
export function getBlockTop(timeStr: string, ctx: PositioningContext): number {
  return ctx.staffHeaderHeight + ctx.gridTopPadding + getTopOffset(timeStr, ctx.startHour, ctx.slotHeightPerHour);
}

export function minuteToY(
  hour: number,
  minute: number,
  ctx: PositioningContext,
): number {
  const t = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return ctx.staffHeaderHeight + ctx.gridTopPadding + getTopOffset(t, ctx.startHour, ctx.slotHeightPerHour);
}

export function yToHourMinute(
  contentY: number,
  ctx: PositioningContext,
): { hour: number; minute: number } {
  return contentYOffsetToHourMinute({
    contentY: contentY - ctx.staffHeaderHeight,
    gridTopPadding: ctx.gridTopPadding,
    startHour: ctx.startHour,
    endHour: ctx.endHour,
    slotHeightPerHour: ctx.slotHeightPerHour,
    timeIncrementMinutes: ctx.timeIncrementMinutes,
  });
}

export function cardHeight(
  booking: Booking | CalendarBooking,
  slotHeightPerHour: number,
  compact: boolean,
): number {
  return getBlockHeight(booking, slotHeightPerHour, compact);
}

export function scrollOffsetForNow(
  ctx: PositioningContext,
  scrollToNowPreference: boolean,
): number {
  if (!scrollToNowPreference) return 0;
  const { h, m } = getHourMinuteForInstantInZone(new Date(), ctx.providerTimezone);
  const offset = Math.max(
    0,
    20 +
      ctx.gridTopPadding +
      (h - ctx.startHour - 1) * ctx.slotHeightPerHour +
      (m / 60) * ctx.slotHeightPerHour,
  );
  return offset;
}
