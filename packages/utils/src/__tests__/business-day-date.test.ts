/**
 * §Booking-slot-audit 2026-05: tests for the customer booking date
 * helpers that anchor the calendar to the provider business day rather
 * than the customer's device-local day. These are the primitives used
 * by `apps/customer`, `apps/web` express, and `apps/web` legacy `/booking`
 * to keep early-morning slots like 03:00/04:00/05:00 from drifting onto
 * the wrong salon date for cross-timezone customers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatBusinessDayYYYYMMDD,
  formatLocalDateYYYYMMDD,
  startOfBusinessDayLocalDate,
} from "../dates";

const SAST = "Africa/Johannesburg"; // UTC+2 (no DST).

describe("formatBusinessDayYYYYMMDD", () => {
  it("falls back to device-local YYYY-MM-DD when no TZ given", () => {
    const d = new Date(2026, 5, 10, 12, 0, 0); // June 10 local noon
    expect(formatBusinessDayYYYYMMDD(d, null)).toBe(formatLocalDateYYYYMMDD(d));
    expect(formatBusinessDayYYYYMMDD(d, undefined)).toBe(formatLocalDateYYYYMMDD(d));
    expect(formatBusinessDayYYYYMMDD(d, "")).toBe(formatLocalDateYYYYMMDD(d));
  });

  it("falls back to device-local when TZ is invalid", () => {
    const d = new Date(2026, 5, 10, 12, 0, 0);
    expect(formatBusinessDayYYYYMMDD(d, "Mars/Olympus_Mons")).toBe(
      formatLocalDateYYYYMMDD(d)
    );
  });

  it("returns the provider business day even when device clock is in a different zone", () => {
    // 23:00 UTC = 01:00 next day SAST → provider business day is +1.
    const instant = new Date("2026-06-10T23:00:00.000Z");
    expect(formatBusinessDayYYYYMMDD(instant, SAST)).toBe("2026-06-11");
  });

  it("normalises legacy offset-style timezones like GMT+2", () => {
    const instant = new Date("2026-06-10T23:00:00.000Z");
    // GMT+2 → Etc/GMT-2 (POSIX flip) → same provider business day as SAST.
    expect(formatBusinessDayYYYYMMDD(instant, "GMT+2")).toBe("2026-06-11");
  });

  it("keeps early-morning slots like 03:00 SAST on the salon calendar day", () => {
    // 03:00 SAST on June 11 == 01:00Z on June 11.
    const earlyMorningInstant = new Date("2026-06-11T01:00:00.000Z");
    expect(formatBusinessDayYYYYMMDD(earlyMorningInstant, SAST)).toBe("2026-06-11");
  });
});

describe("startOfBusinessDayLocalDate", () => {
  let originalDateNow: () => number;

  beforeEach(() => {
    originalDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = originalDateNow;
    vi.useRealTimers();
  });

  it("returns a Date whose Y/M/D equals the provider business day for `now`", () => {
    // Freeze "now" at 21:30 UTC on 2026-06-10 → SAST is already 23:30 same day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T21:30:00.000Z"));

    const out = startOfBusinessDayLocalDate(SAST);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(5); // June (0-indexed)
    expect(out.getDate()).toBe(10);
  });

  it("rolls to the next salon business day when the customer is still in yesterday", () => {
    // 23:30 UTC on 2026-06-10 → SAST is 01:30 on 2026-06-11.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T23:30:00.000Z"));

    const out = startOfBusinessDayLocalDate(SAST);
    expect(out.getFullYear()).toBe(2026);
    expect(out.getMonth()).toBe(5);
    expect(out.getDate()).toBe(11);
    // formatLocalDateYYYYMMDD reads the same device-local Y/M/D so it
    // matches the salon date the API expects.
    expect(formatLocalDateYYYYMMDD(out)).toBe("2026-06-11");
  });

  it("respects offsetDays from the provider business day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T08:00:00.000Z"));

    const d0 = startOfBusinessDayLocalDate(SAST, 0);
    const d1 = startOfBusinessDayLocalDate(SAST, 1);
    const d7 = startOfBusinessDayLocalDate(SAST, 7);
    expect(formatLocalDateYYYYMMDD(d0)).toBe("2026-06-10");
    expect(formatLocalDateYYYYMMDD(d1)).toBe("2026-06-11");
    expect(formatLocalDateYYYYMMDD(d7)).toBe("2026-06-17");
  });

  it("falls back to device-local midnight when TZ is missing or invalid", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00.000Z"));

    const a = startOfBusinessDayLocalDate(null);
    const b = startOfBusinessDayLocalDate(undefined);
    const c = startOfBusinessDayLocalDate("Mars/Olympus_Mons");
    for (const out of [a, b, c]) {
      expect(out.getHours()).toBe(0);
      expect(out.getMinutes()).toBe(0);
      expect(out.getSeconds()).toBe(0);
    }
  });
});
