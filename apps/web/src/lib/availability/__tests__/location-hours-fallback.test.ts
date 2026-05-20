import { describe, it, expect } from "vitest";
import { resolveLocationHoursDay } from "../location-hours-fallback";

describe("resolveLocationHoursDay", () => {
  it("returns null when day data is missing or not an object", () => {
    expect(resolveLocationHoursDay(null)).toBeNull();
    expect(resolveLocationHoursDay(undefined)).toBeNull();
    // @ts-expect-error - intentionally passing wrong type
    expect(resolveLocationHoursDay("closed")).toBeNull();
  });

  it("returns null when Format A marks the day closed (is_open === false)", () => {
    expect(
      resolveLocationHoursDay({
        is_open: false,
        open_time: "08:00",
        close_time: "18:00",
      }),
    ).toBeNull();
  });

  it("returns null when Format B marks the day closed (closed === true)", () => {
    expect(
      resolveLocationHoursDay({ open: "08:00", close: "18:00", closed: true }),
    ).toBeNull();
  });

  it("resolves Format A times verbatim when the day is open", () => {
    const result = resolveLocationHoursDay({
      is_open: true,
      open_time: "07:30",
      close_time: "16:00",
    });
    expect(result).toEqual({ start_time: "07:30", end_time: "16:00" });
  });

  it("resolves Format B (onboarding) times when only `open`/`close` exist", () => {
    const result = resolveLocationHoursDay({
      open: "09:00",
      close: "20:00",
      closed: false,
    });
    expect(result).toEqual({ start_time: "09:00", end_time: "20:00" });
  });

  it("prefers Format A keys when both shapes are present", () => {
    const result = resolveLocationHoursDay({
      is_open: true,
      open_time: "06:00",
      close_time: "14:00",
      open: "09:00",
      close: "17:00",
      closed: false,
    });
    expect(result).toEqual({ start_time: "06:00", end_time: "14:00" });
  });

  it("trims times that include seconds (e.g. database time strings)", () => {
    const result = resolveLocationHoursDay({
      is_open: true,
      open_time: "08:00:00",
      close_time: "18:30:00",
    });
    expect(result).toEqual({ start_time: "08:00", end_time: "18:30" });
  });
});
