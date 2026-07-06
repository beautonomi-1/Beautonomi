import { describe, expect, it } from "vitest";
import {
  composeLegalDobIso,
  daysInMonth,
  legalDobYearRange,
  parseLegalDobIso,
  validateLegalDobParts,
} from "./legal-dob";

describe("legal-dob", () => {
  const now = new Date("2026-07-05T12:00:00.000Z");

  it("composes and parses ISO dates", () => {
    const iso = composeLegalDobIso({ day: 15, month: 3, year: 1990 });
    expect(iso).toBe("1990-03-15");
    expect(parseLegalDobIso(iso)).toEqual({ day: 15, month: 3, year: 1990 });
  });

  it("validates leap day in leap year", () => {
    expect(validateLegalDobParts({ day: 29, month: 2, year: 2000 }, { now, minAge: 18 })).toBeNull();
  });

  it("rejects invalid day for month", () => {
    expect(validateLegalDobParts({ day: 31, month: 2, year: 2000 }, { now, minAge: 18 })).toMatch(/valid day/);
  });

  it("rejects under-age dates", () => {
    expect(validateLegalDobParts({ day: 1, month: 1, year: 2015 }, { now, minAge: 18 })).toMatch(/at least 18/);
  });

  it("computes days in month", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
  });

  it("builds descending year range ending at min age", () => {
    const years = legalDobYearRange({ minAge: 18, maxAge: 100, now });
    expect(years[0]).toBe(2008);
    expect(years[years.length - 1]).toBe(1926);
    expect(years).toHaveLength(83);
  });
});
