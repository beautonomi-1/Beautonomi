import { describe, expect, it } from "vitest";
import {
  formatDateKeyInTimeZone,
  getWallMinutesInTimeZone,
  getWeekdayInTimeZone,
  wallClockInTimeZone,
} from "../timezone";
import { dayMinuteRanges } from "../dayMinuteRanges";
import { slotIsOutsideWeekly, hourIsOutsideWeekly } from "../slotIsInside";
import { deriveGridHourWindow } from "../deriveGridHourWindow";

// Reference instant: 2026-04-18 22:30Z
// In Africa/Johannesburg (UTC+2)  → Sun 2026-04-19 00:30
// In America/New_York  (UTC-4 DST) → Sat 2026-04-18 18:30
// In Pacific/Honolulu  (UTC-10)    → Sat 2026-04-18 12:30
// In Asia/Tokyo        (UTC+9)     → Sun 2026-04-19 07:30
const lateSaturdayUtc = new Date("2026-04-18T22:30:00Z");

describe("wallClockInTimeZone", () => {
  it("projects a UTC instant into a named IANA zone", () => {
    const jhb = wallClockInTimeZone(lateSaturdayUtc, "Africa/Johannesburg");
    expect(jhb).toEqual(
      expect.objectContaining({
        year: 2026,
        month: 4,
        day: 19,
        weekday: 0, // Sunday
        hour: 0,
        minute: 30,
      }),
    );

    const nyc = wallClockInTimeZone(lateSaturdayUtc, "America/New_York");
    expect(nyc).toEqual(
      expect.objectContaining({
        year: 2026,
        month: 4,
        day: 18,
        weekday: 6, // Saturday
        hour: 18,
        minute: 30,
      }),
    );

    const tokyo = wallClockInTimeZone(lateSaturdayUtc, "Asia/Tokyo");
    expect(tokyo).toEqual(
      expect.objectContaining({
        year: 2026,
        month: 4,
        day: 19,
        weekday: 0,
        hour: 7,
        minute: 30,
      }),
    );
  });

  it("falls back to device-local getters when timeZone is nullish or invalid", () => {
    const fb = wallClockInTimeZone(lateSaturdayUtc, null);
    expect(fb.hour).toBe(lateSaturdayUtc.getHours());
    expect(fb.weekday).toBe(lateSaturdayUtc.getDay());
    const bad = wallClockInTimeZone(lateSaturdayUtc, "Not/AZone");
    expect(bad.weekday).toBe(lateSaturdayUtc.getDay());
  });
});

describe("getWeekdayInTimeZone", () => {
  it("returns the wall-clock day of week in the provider zone", () => {
    expect(getWeekdayInTimeZone(lateSaturdayUtc, "Africa/Johannesburg")).toBe(0); // Sunday
    expect(getWeekdayInTimeZone(lateSaturdayUtc, "America/New_York")).toBe(6); // Saturday
    expect(getWeekdayInTimeZone(lateSaturdayUtc, "Pacific/Honolulu")).toBe(6); // Saturday
  });
});

describe("formatDateKeyInTimeZone", () => {
  it("returns YYYY-MM-DD for the provider zone, not the host zone", () => {
    expect(formatDateKeyInTimeZone(lateSaturdayUtc, "Africa/Johannesburg")).toBe("2026-04-19");
    expect(formatDateKeyInTimeZone(lateSaturdayUtc, "America/New_York")).toBe("2026-04-18");
    expect(formatDateKeyInTimeZone(lateSaturdayUtc, "Asia/Tokyo")).toBe("2026-04-19");
  });
});

describe("getWallMinutesInTimeZone", () => {
  it("returns minutes-since-midnight in the provider zone", () => {
    expect(getWallMinutesInTimeZone(lateSaturdayUtc, "Africa/Johannesburg")).toBe(30);
    expect(getWallMinutesInTimeZone(lateSaturdayUtc, "America/New_York")).toBe(18 * 60 + 30);
  });
});

describe("dayMinuteRanges with timeZone", () => {
  it("uses the tz weekday so a late-Saturday UTC instant is read as Sunday in JHB", () => {
    const weekly = {
      saturday: { open: "09:00", close: "17:00" },
      sunday: { open: "10:00", close: "14:00" },
    };
    // Without tz: device-local interpretation — depends on host, so don't assert.
    const jhb = dayMinuteRanges(lateSaturdayUtc, weekly, "Africa/Johannesburg");
    expect(jhb).toEqual([{ startMin: 10 * 60, endMin: 14 * 60 }]);
    const nyc = dayMinuteRanges(lateSaturdayUtc, weekly, "America/New_York");
    expect(nyc).toEqual([{ startMin: 9 * 60, endMin: 17 * 60 }]);
  });

  it("carries overnight tail correctly in the provider zone", () => {
    const weekly = {
      saturday: { open: "22:00", close: "02:00" },
      sunday: { open: "12:00", close: "15:00" },
    };
    // In JHB this instant is Sunday 00:30 → should see tail [0, 120] + Sunday 12-15.
    expect(dayMinuteRanges(lateSaturdayUtc, weekly, "Africa/Johannesburg")).toEqual([
      { startMin: 0, endMin: 2 * 60 },
      { startMin: 12 * 60, endMin: 15 * 60 },
    ]);
    // In NYC this instant is still Saturday → should see the Saturday opening block.
    expect(dayMinuteRanges(lateSaturdayUtc, weekly, "America/New_York")).toEqual([
      { startMin: 22 * 60, endMin: 24 * 60 },
    ]);
  });
});

describe("slotIsOutsideWeekly with timeZone", () => {
  it("a 00:30 slot on the JHB-Sunday side is inside Sunday open hours", () => {
    const weekly = { sunday: { open: "00:00", close: "06:00" } };
    expect(
      slotIsOutsideWeekly(lateSaturdayUtc, 30, 60, weekly, "strict", "Africa/Johannesburg"),
    ).toBe(false);
    expect(
      slotIsOutsideWeekly(lateSaturdayUtc, 30, 60, weekly, "strict", "America/New_York"),
    ).toBe(true);
  });

  it("hourIsOutsideWeekly shades the right hour in the provider zone", () => {
    const weekly = { sunday: { open: "01:00", close: "06:00" } };
    // Sunday 00:00-01:00 overlaps nothing → outside.
    expect(
      hourIsOutsideWeekly(lateSaturdayUtc, 0, weekly, "Africa/Johannesburg"),
    ).toBe(true);
    // NYC interprets this instant as Saturday → Sunday schedule doesn't apply → outside.
    expect(
      hourIsOutsideWeekly(lateSaturdayUtc, 0, weekly, "America/New_York"),
    ).toBe(true);
  });
});

describe("deriveGridHourWindow with timeZone", () => {
  it("resolves visibleDates weekdays in the provider zone", () => {
    const weekly = {
      sunday: { open: "10:00", close: "14:00" },
      saturday: { open: "09:00", close: "17:00" },
    };
    // Pass the same late-Saturday-UTC instant as the only visible date.
    const jhb = deriveGridHourWindow({
      visibleDates: [lateSaturdayUtc],
      locationOperatingHours: weekly,
      paddingHours: 0,
      defaultStartHour: 8,
      defaultEndHour: 20,
      timeZone: "Africa/Johannesburg",
    });
    expect({ startHour: jhb.startHour, endHour: jhb.endHour }).toEqual({
      startHour: 10,
      endHour: 14,
    });

    const nyc = deriveGridHourWindow({
      visibleDates: [lateSaturdayUtc],
      locationOperatingHours: weekly,
      paddingHours: 0,
      defaultStartHour: 8,
      defaultEndHour: 20,
      timeZone: "America/New_York",
    });
    expect({ startHour: nyc.startHour, endHour: nyc.endHour }).toEqual({
      startHour: 9,
      endHour: 17,
    });
  });

  it("matches event.date keys to the provider-zone YYYY-MM-DD", () => {
    const weekly = { sunday: { open: "08:00", close: "10:00" } };
    const window = deriveGridHourWindow({
      visibleDates: [lateSaturdayUtc],
      locationOperatingHours: weekly,
      events: [
        { date: "2026-04-19", startMin: 18 * 60, endMin: 20 * 60 },
      ],
      paddingHours: 0,
      timeZone: "Africa/Johannesburg",
    });
    expect({ startHour: window.startHour, endHour: window.endHour }).toEqual({
      startHour: 8,
      endHour: 20,
    });
  });
});
