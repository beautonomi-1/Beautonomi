import { describe, it, expect } from "vitest";
import { shiftMinuteRanges, segmentFitsAnyShift } from "../shift-fit";

// Helper: convert "HH:MM" to minutes
const m = (hhmm: string) => {
  const [h, min] = hhmm.split(":").map(Number);
  return h * 60 + min;
};
const shift = (start: string, end: string) => ({ start_time: start, end_time: end });

describe("shiftMinuteRanges", () => {
  it("normal shift returns single same-day range", () => {
    const ranges = shiftMinuteRanges(shift("09:00", "17:00"));
    expect(ranges).toEqual([{ start: m("09:00"), end: m("17:00"), dayOffset: 0 }]);
  });

  it("overnight shift returns two ranges", () => {
    const ranges = shiftMinuteRanges(shift("18:00", "02:00"));
    expect(ranges).toEqual([
      { start: m("18:00"), end: 1440, dayOffset: 0 },
      { start: 0, end: m("02:00"), dayOffset: 1 },
    ]);
  });

  it("midnight-close shift (00:00) returns two ranges", () => {
    // "09:00" to "00:00" — end_time is midnight which is 0 minutes, less than start
    const ranges = shiftMinuteRanges(shift("09:00", "00:00"));
    expect(ranges).toEqual([
      { start: m("09:00"), end: 1440, dayOffset: 0 },
      { start: 0, end: 0, dayOffset: 1 },
    ]);
  });

  it("zero-length shift returns empty array", () => {
    expect(shiftMinuteRanges(shift("09:00", "09:00"))).toEqual([]);
  });
});

describe("segmentFitsAnyShift", () => {
  // ── Normal shift 09:00-17:00 ─────────────────────────────────────────────
  describe("normal shift 09:00-17:00", () => {
    const shifts = [shift("09:00", "17:00")];

    it("fits a segment in the middle", () => {
      expect(segmentFitsAnyShift(m("14:00"), m("15:30"), shifts)).toBe(true);
    });

    it("fits a segment that starts at open", () => {
      expect(segmentFitsAnyShift(m("09:00"), m("10:00"), shifts)).toBe(true);
    });

    it("fits a segment that ends exactly at close", () => {
      expect(segmentFitsAnyShift(m("16:00"), m("17:00"), shifts)).toBe(true);
    });

    it("does NOT fit a segment that ends after close", () => {
      expect(segmentFitsAnyShift(m("16:30"), m("18:00"), shifts)).toBe(false);
    });

    it("does NOT fit a segment that starts before open", () => {
      expect(segmentFitsAnyShift(m("08:00"), m("09:30"), shifts)).toBe(false);
    });

    it("does NOT fit a segment entirely outside shift", () => {
      expect(segmentFitsAnyShift(m("17:30"), m("18:30"), shifts)).toBe(false);
    });
  });

  // ── Overnight shift 18:00-02:00 ──────────────────────────────────────────
  describe("overnight shift 18:00-02:00", () => {
    const shifts = [shift("18:00", "02:00")];

    it("fits a segment wholly in the evening (day-0) part", () => {
      expect(segmentFitsAnyShift(m("19:00"), m("20:00"), shifts)).toBe(true);
    });

    it("fits a segment at the very start of evening part", () => {
      expect(segmentFitsAnyShift(m("18:00"), m("18:45"), shifts)).toBe(true);
    });

    it("fits a segment that goes right up to midnight (day-0 range ends at 1440)", () => {
      expect(segmentFitsAnyShift(m("23:00"), m("23:45"), shifts)).toBe(true);
    });

    it("fits a segment wholly in the early-morning (day-1 wrap) part", () => {
      // 01:00-01:30 is in the [0, 120] day-1 wrap range
      expect(segmentFitsAnyShift(m("01:00"), m("01:30"), shifts)).toBe(true);
    });

    it("does NOT fit a segment that ends after the day-1 wrap closes", () => {
      // 01:45-03:00 — 03:00 > 02:00
      expect(segmentFitsAnyShift(m("01:45"), m("03:00"), shifts)).toBe(false);
    });

    it("does NOT fit a segment in the middle-of-day gap", () => {
      expect(segmentFitsAnyShift(m("03:00"), m("04:00"), shifts)).toBe(false);
    });

    it("does NOT fit a segment that starts in the gap and ends in the evening", () => {
      expect(segmentFitsAnyShift(m("10:00"), m("18:30"), shifts)).toBe(false);
    });
  });

  // ── Midnight-close shift 09:00-00:00 ─────────────────────────────────────
  describe("midnight-close shift 09:00-00:00", () => {
    const shifts = [shift("09:00", "00:00")];

    it("fits a segment well within working hours", () => {
      expect(segmentFitsAnyShift(m("10:00"), m("11:00"), shifts)).toBe(true);
    });

    it("fits a segment that ends exactly at 23:45", () => {
      expect(segmentFitsAnyShift(m("23:00"), m("23:45"), shifts)).toBe(true);
    });

    it("does NOT fit a segment that would cross midnight (end > 0 on next day)", () => {
      // 23:30–00:30 crosses midnight — end min overflows into day 1
      // In wall-clock terms: segEndMin (30) < segStartMin (1410) — crosses midnight
      // The day-1 wrap range ends at 0, so 30 > 0 means it doesn't fit
      expect(segmentFitsAnyShift(m("23:30"), m("00:30"), shifts)).toBe(false);
    });

    it("does NOT fit a segment starting before the shift opens", () => {
      expect(segmentFitsAnyShift(m("08:00"), m("09:00"), shifts)).toBe(false);
    });
  });

  // ── Zero-length shift ─────────────────────────────────────────────────────
  describe("zero-length shift 09:00-09:00", () => {
    it("never fits any segment", () => {
      expect(segmentFitsAnyShift(m("09:00"), m("09:30"), [shift("09:00", "09:00")])).toBe(false);
      expect(segmentFitsAnyShift(m("08:30"), m("09:00"), [shift("09:00", "09:00")])).toBe(false);
    });
  });

  // ── Multiple shifts (split-shift support) ────────────────────────────────
  describe("split shifts 09:00-12:00 + 14:00-18:00", () => {
    const shifts = [shift("09:00", "12:00"), shift("14:00", "18:00")];

    it("fits in first shift", () => {
      expect(segmentFitsAnyShift(m("10:00"), m("11:30"), shifts)).toBe(true);
    });

    it("fits in second shift", () => {
      expect(segmentFitsAnyShift(m("15:00"), m("17:00"), shifts)).toBe(true);
    });

    it("does NOT fit in the gap between shifts", () => {
      expect(segmentFitsAnyShift(m("12:00"), m("13:00"), shifts)).toBe(false);
    });

    it("does NOT fit spanning across both shifts", () => {
      expect(segmentFitsAnyShift(m("11:00"), m("15:00"), shifts)).toBe(false);
    });
  });

  // ── at_home travel buffer (segEndMin extends past normal close) ───────────
  describe("travel buffer tail pushes segment end past shift close", () => {
    const shifts = [shift("09:00", "17:00")];

    it("booking at 16:00 with 60-min duration + 30-min travel buffer does NOT fit 17:00 close", () => {
      // duration 60, travel tail 30 -> effectiveEnd = 16:00 + 90min = 17:30
      expect(segmentFitsAnyShift(m("16:00"), m("17:30"), shifts)).toBe(false);
    });

    it("booking at 15:30 with 60-min duration + 30-min travel buffer fits 17:00 close", () => {
      // 15:30 + 90min = 17:00 exactly
      expect(segmentFitsAnyShift(m("15:30"), m("17:00"), shifts)).toBe(true);
    });
  });
});
