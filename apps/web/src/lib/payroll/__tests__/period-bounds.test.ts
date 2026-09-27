import { describe, expect, it } from "vitest";
import {
  calendarDayInTimezone,
  resolvePayPeriodBounds,
} from "../period-bounds";

describe("resolvePayPeriodBounds", () => {
  it("includes full last calendar day in Africa/Johannesburg", () => {
    const { from, to } = resolvePayPeriodBounds(
      "2026-09-01",
      "2026-09-30",
      "Africa/Johannesburg",
    );
    expect(from.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(to.getTime()).toBeGreaterThan(
      new Date("2026-09-30T12:00:00.000Z").getTime(),
    );
    const lateOnLastDay = new Date("2026-09-30T20:00:00.000Z");
    expect(lateOnLastDay.getTime()).toBeLessThanOrEqual(to.getTime());
    expect(lateOnLastDay.getTime()).toBeGreaterThanOrEqual(from.getTime());
  });

  it("calendarDayInTimezone matches salon local date", () => {
    const day = calendarDayInTimezone(
      "2026-09-30T23:30:00.000Z",
      "Africa/Johannesburg",
    );
    expect(day).toBe("2026-10-01");
  });
});
