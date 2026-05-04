import {
  addCalendarDaysToDateKey,
  contentYOffsetToHourMinute,
  getBlockHeight,
  getTopOffset,
} from "@/components/calendar/calendar-layout";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";

describe("calendar-layout", () => {
  it("addCalendarDaysToDateKey advances calendar dates in UTC", () => {
    expect(addCalendarDaysToDateKey("2026-01-28", 1)).toBe("2026-01-29");
    expect(addCalendarDaysToDateKey("2026-01-28", 8)).toBe("2026-02-05");
  });

  it("getTopOffset returns 0 for unparseable scheduled_at", () => {
    expect(getTopOffset("", 8, 60, null)).toBe(0);
  });

  it("getBlockHeight falls back when durations missing", () => {
    const booking = {
      services: [{ duration_minutes: 0 } as never],
    } as CalendarBooking;
    expect(getBlockHeight(booking, 60, false)).toBeGreaterThan(10);
  });

  it("contentYOffsetToHourMinute: finger offset within grid equals absoluteY minus gridTop (no extra scroll term)", () => {
    const gridTopPadding = 8;
    const slotHeightPerHour = 60;
    const timeIncrementMinutes = 15;
    const rowHeight = (timeIncrementMinutes / 60) * slotHeightPerHour;
    const startHour = 8;
    const fingerYWithinGrid = gridTopPadding + rowHeight * 4;
    expect(
      contentYOffsetToHourMinute({
        contentY: fingerYWithinGrid,
        gridTopPadding,
        startHour,
        endHour: 20,
        slotHeightPerHour,
        timeIncrementMinutes,
      }),
    ).toEqual({ hour: 9, minute: 0 });
  });

  it("contentYOffsetToHourMinute maps y offset to 30-min slot times", () => {
    const gridTopPadding = 8;
    const slotHeightPerHour = 120;
    const timeIncrementMinutes = 30;
    const rowHeight = (timeIncrementMinutes / 60) * slotHeightPerHour;
    const startHour = 8;
    expect(
      contentYOffsetToHourMinute({
        contentY: gridTopPadding + rowHeight * 0,
        gridTopPadding,
        startHour,
        endHour: 18,
        slotHeightPerHour,
        timeIncrementMinutes,
      }),
    ).toEqual({ hour: 8, minute: 0 });
    expect(
      contentYOffsetToHourMinute({
        contentY: gridTopPadding + rowHeight * 1,
        gridTopPadding,
        startHour,
        endHour: 18,
        slotHeightPerHour,
        timeIncrementMinutes,
      }),
    ).toEqual({ hour: 8, minute: 30 });
  });
});
