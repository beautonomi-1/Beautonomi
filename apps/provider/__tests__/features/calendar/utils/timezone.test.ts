import { parseCalendarDateParam, calendarDateKey, currentWallClockTimeInZone } from "@/features/calendar/utils/timezone";

describe("parseCalendarDateParam", () => {
  it("parses YYYY-MM-DD without TZ as local calendar date", () => {
    const d = parseCalendarDateParam("2026-05-08", null);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(8);
  });

  it("returns null for invalid string", () => {
    const d = parseCalendarDateParam("not-a-date", null);
    expect(d).toBeNull();
  });

  it("parses YYYY-MM-DD with Africa/Johannesburg TZ", () => {
    const d = parseCalendarDateParam("2026-05-08", "Africa/Johannesburg");
    expect(d).not.toBeNull();
  });

  it("parses ISO datetime string", () => {
    const d = parseCalendarDateParam("2026-05-08T12:00:00.000Z", null);
    expect(d).not.toBeNull();
  });
});

describe("calendarDateKey", () => {
  it("formats date as YYYY-MM-DD without TZ", () => {
    const d = new Date(2026, 4, 8);
    expect(calendarDateKey(d, null)).toBe("2026-05-08");
  });

  it("formats date with UTC timezone", () => {
    const d = new Date("2026-05-08T00:00:00.000Z");
    const key = calendarDateKey(d, "UTC");
    expect(key).toBe("2026-05-08");
  });
});

describe("currentWallClockTimeInZone", () => {
  it("returns a valid HH:MM string", () => {
    const t = currentWallClockTimeInZone("UTC");
    expect(/^\d{2}:\d{2}$/.test(t)).toBe(true);
  });

  it("returns a valid time for null timezone", () => {
    const t = currentWallClockTimeInZone(null);
    expect(/^\d{2}:\d{2}$/.test(t)).toBe(true);
  });
});
