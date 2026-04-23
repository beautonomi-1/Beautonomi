import { describe, expect, it } from "vitest";
import {
  hourIsOutsideWeekly,
  slotIsInsideRanges,
  slotIsOutsideWeekly,
  slotOverlapsRanges,
} from "../slotIsInside";

const monday = new Date("2026-04-20T12:00:00Z");
const tuesday = new Date("2026-04-21T12:00:00Z");

describe("slotIsInsideRanges / slotOverlapsRanges", () => {
  const ranges = [
    { startMin: 9 * 60, endMin: 12 * 60 },
    { startMin: 13 * 60, endMin: 17 * 60 },
  ];
  it("returns true only when fully contained", () => {
    expect(slotIsInsideRanges(9 * 60, 10 * 60, ranges)).toBe(true);
    expect(slotIsInsideRanges(11 * 60, 13 * 60, ranges)).toBe(false);
    expect(slotIsInsideRanges(8 * 60, 10 * 60, ranges)).toBe(false);
  });
  it("overlap returns true for any intersection", () => {
    expect(slotOverlapsRanges(8 * 60 + 30, 9 * 60 + 15, ranges)).toBe(true);
    expect(slotOverlapsRanges(12 * 60, 13 * 60, ranges)).toBe(false);
    expect(slotOverlapsRanges(17 * 60, 18 * 60, ranges)).toBe(false);
  });
  it("rejects zero-length slots", () => {
    expect(slotIsInsideRanges(10 * 60, 10 * 60, ranges)).toBe(false);
    expect(slotOverlapsRanges(10 * 60, 10 * 60, ranges)).toBe(false);
  });
});

describe("slotIsOutsideWeekly", () => {
  const weekly = { monday: { open: "09:30", close: "17:00" } };

  it("strict mode treats a 09:00 hour as outside when open is 09:30", () => {
    expect(slotIsOutsideWeekly(monday, 9 * 60, 10 * 60, weekly, "strict")).toBe(true);
  });
  it("overlap mode treats a 09:00 hour as inside when open is 09:30", () => {
    expect(slotIsOutsideWeekly(monday, 9 * 60, 10 * 60, weekly, "overlap")).toBe(false);
  });
  it("minute-accurate: a 09:30 15-min slot is inside when open is 09:30", () => {
    expect(slotIsOutsideWeekly(monday, 9 * 60 + 30, 9 * 60 + 45, weekly, "strict")).toBe(false);
  });
  it("no weekly -> treated as no constraint", () => {
    expect(slotIsOutsideWeekly(monday, 0, 60, null)).toBe(false);
  });
  it("closed day -> outside", () => {
    expect(
      slotIsOutsideWeekly(monday, 10 * 60, 11 * 60, { monday: { closed: true } }),
    ).toBe(true);
  });
  it("overnight shift picks up on the next day", () => {
    const overnight = {
      monday: { open: "22:00", close: "02:00" },
      tuesday: { open: "10:00", close: "14:00" },
    };
    expect(slotIsOutsideWeekly(tuesday, 60, 90, overnight, "strict")).toBe(false);
    expect(slotIsOutsideWeekly(tuesday, 150, 3 * 60, overnight, "strict")).toBe(true);
  });
});

describe("hourIsOutsideWeekly (overlap semantics)", () => {
  it("09:00 row is clickable when open is 09:30", () => {
    expect(hourIsOutsideWeekly(monday, 9, { monday: { open: "09:30", close: "17:00" } })).toBe(false);
  });
  it("08:00 row is shaded closed when open is 09:30", () => {
    expect(hourIsOutsideWeekly(monday, 8, { monday: { open: "09:30", close: "17:00" } })).toBe(true);
  });
  it("17:00 row is shaded closed when close is 17:00", () => {
    expect(hourIsOutsideWeekly(monday, 17, { monday: { open: "09:00", close: "17:00" } })).toBe(true);
  });
});
