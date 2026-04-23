import { describe, expect, it } from "vitest";
import {
  resolveDayHours,
  resolveWeeklyDay,
  timeStringToMinutes,
  minutesToTimeString,
} from "../resolveDayHours";

describe("timeStringToMinutes", () => {
  it("parses HH:MM", () => {
    expect(timeStringToMinutes("09:00")).toBe(540);
    expect(timeStringToMinutes("09:30")).toBe(570);
    expect(timeStringToMinutes("23:59")).toBe(23 * 60 + 59);
  });
  it("parses single-digit hours", () => {
    expect(timeStringToMinutes("9:05")).toBe(545);
  });
  it("returns null for invalid", () => {
    expect(timeStringToMinutes(undefined)).toBeNull();
    expect(timeStringToMinutes(null)).toBeNull();
    expect(timeStringToMinutes("")).toBeNull();
    expect(timeStringToMinutes("not-a-time")).toBeNull();
    expect(timeStringToMinutes("12")).toBeNull();
  });
  it("clamps out-of-range hours/minutes rather than returning null", () => {
    expect(timeStringToMinutes("25:00")).toBe(23 * 60);
    expect(timeStringToMinutes("10:99")).toBe(10 * 60 + 59);
  });
});

describe("minutesToTimeString", () => {
  it("zero-pads", () => {
    expect(minutesToTimeString(0)).toBe("00:00");
    expect(minutesToTimeString(540)).toBe("09:00");
    expect(minutesToTimeString(570)).toBe("09:30");
    expect(minutesToTimeString(23 * 60 + 59)).toBe("23:59");
  });
});

describe("resolveDayHours", () => {
  it("handles modern {open, close, closed: false}", () => {
    expect(resolveDayHours({ open: "09:00", close: "17:00", closed: false })).toEqual({
      openMin: 540,
      closeMin: 17 * 60,
      closed: false,
    });
  });
  it("handles mobile {open_time, close_time, is_open: true}", () => {
    expect(
      resolveDayHours({ open_time: "08:30", close_time: "18:00", is_open: true }),
    ).toEqual({ openMin: 8 * 60 + 30, closeMin: 18 * 60, closed: false });
  });
  it("honours closed: true short-circuit", () => {
    expect(resolveDayHours({ closed: true, open: "09:00", close: "17:00" })).toEqual({
      openMin: 0,
      closeMin: 0,
      closed: true,
    });
  });
  it("honours is_open: false short-circuit", () => {
    expect(resolveDayHours({ is_open: false, open: "09:00", close: "17:00" })).toEqual({
      openMin: 0,
      closeMin: 0,
      closed: true,
    });
  });
  it("falls back through legacy start/end keys", () => {
    expect(resolveDayHours({ start: "10:00", end: "14:00" })).toEqual({
      openMin: 10 * 60,
      closeMin: 14 * 60,
      closed: false,
    });
    expect(resolveDayHours({ start_time: "06:00", end_time: "07:00" })).toEqual({
      openMin: 6 * 60,
      closeMin: 7 * 60,
      closed: false,
    });
  });
  it("returns null for garbage", () => {
    expect(resolveDayHours(null)).toBeNull();
    expect(resolveDayHours(undefined)).toBeNull();
    expect(resolveDayHours("nope")).toBeNull();
    expect(resolveDayHours([])).toBeNull();
    expect(resolveDayHours({})).toBeNull();
    expect(resolveDayHours({ open: "not-a-time", close: "17:00" })).toBeNull();
  });
});

describe("resolveWeeklyDay", () => {
  const weekly = {
    monday: { open: "09:00", close: "17:00" },
    tuesday: { closed: true, open: "00:00", close: "00:00" },
  };
  it("looks up by JS day index (0=sunday)", () => {
    expect(resolveWeeklyDay(weekly, 1)).toMatchObject({ openMin: 540, closeMin: 17 * 60 });
    expect(resolveWeeklyDay(weekly, 2)).toMatchObject({ closed: true });
  });
  it("returns null for missing days / bad input", () => {
    expect(resolveWeeklyDay(weekly, 0)).toBeNull();
    expect(resolveWeeklyDay(null, 0)).toBeNull();
  });
});
