import { describe, expect, it } from "vitest";
import {
  dayMinuteRanges,
  dayMinuteRangesFromDayHours,
  expandResolvedDay,
} from "../dayMinuteRanges";

const monday = new Date("2026-04-20T12:00:00Z");
const tuesday = new Date("2026-04-21T12:00:00Z");
const sunday = new Date("2026-04-19T12:00:00Z");

describe("expandResolvedDay", () => {
  it("normal day -> single range, no overnight", () => {
    const r = expandResolvedDay({ openMin: 540, closeMin: 17 * 60, closed: false });
    expect(r.sameDay).toEqual([{ startMin: 540, endMin: 17 * 60 }]);
    expect(r.overnightTailMin).toBe(0);
  });
  it("closed / null -> empty", () => {
    expect(expandResolvedDay({ openMin: 0, closeMin: 0, closed: true })).toEqual({
      sameDay: [],
      overnightTailMin: 0,
    });
    expect(expandResolvedDay(null)).toEqual({ sameDay: [], overnightTailMin: 0 });
  });
  it("overnight -> same-day tail to 1440 + overnightTail for next day", () => {
    const r = expandResolvedDay({ openMin: 22 * 60, closeMin: 2 * 60, closed: false });
    expect(r.sameDay).toEqual([{ startMin: 22 * 60, endMin: 24 * 60 }]);
    expect(r.overnightTailMin).toBe(2 * 60);
  });
  it("open == close -> empty (no open window)", () => {
    expect(expandResolvedDay({ openMin: 600, closeMin: 600, closed: false })).toEqual({
      sameDay: [],
      overnightTailMin: 0,
    });
  });
});

describe("dayMinuteRanges", () => {
  it("picks the right day from the weekly schedule", () => {
    const weekly = {
      monday: { open: "09:00", close: "17:00" },
      tuesday: { open: "10:00", close: "14:00" },
    };
    expect(dayMinuteRanges(monday, weekly)).toEqual([{ startMin: 540, endMin: 17 * 60 }]);
    expect(dayMinuteRanges(tuesday, weekly)).toEqual([
      { startMin: 10 * 60, endMin: 14 * 60 },
    ]);
  });
  it("carries overnight tail from the previous day", () => {
    const weekly = {
      monday: { open: "22:00", close: "02:00" },
      tuesday: { open: "10:00", close: "14:00" },
    };
    expect(dayMinuteRanges(tuesday, weekly)).toEqual([
      { startMin: 0, endMin: 2 * 60 },
      { startMin: 10 * 60, endMin: 14 * 60 },
    ]);
  });
  it("merges an overnight tail that overlaps the next day's opening", () => {
    const weekly = {
      monday: { open: "22:00", close: "11:00" },
      tuesday: { open: "09:00", close: "14:00" },
    };
    expect(dayMinuteRanges(tuesday, weekly)).toEqual([
      { startMin: 0, endMin: 14 * 60 },
    ]);
  });
  it("wraps correctly across Sunday -> Monday", () => {
    const weekly = {
      sunday: { open: "20:00", close: "03:00" },
      monday: { open: "09:00", close: "17:00" },
    };
    expect(dayMinuteRanges(monday, weekly)).toEqual([
      { startMin: 0, endMin: 3 * 60 },
      { startMin: 9 * 60, endMin: 17 * 60 },
    ]);
    expect(dayMinuteRanges(sunday, weekly)).toEqual([
      { startMin: 20 * 60, endMin: 24 * 60 },
    ]);
  });
  it("empty / missing schedule -> no ranges", () => {
    expect(dayMinuteRanges(monday, null)).toEqual([]);
    expect(dayMinuteRanges(monday, {})).toEqual([]);
    expect(dayMinuteRanges(monday, { monday: { closed: true, open: "0", close: "0" } })).toEqual([]);
  });
});

describe("dayMinuteRangesFromDayHours", () => {
  it("accepts a single day entry", () => {
    expect(dayMinuteRangesFromDayHours({ open: "09:00", close: "17:00" })).toEqual([
      { startMin: 540, endMin: 17 * 60 },
    ]);
    expect(dayMinuteRangesFromDayHours({ closed: true })).toEqual([]);
  });
});
