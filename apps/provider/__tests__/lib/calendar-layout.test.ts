import {
  addCalendarDaysToDateKey,
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
});
