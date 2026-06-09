import {
  buildDateOptions,
  findNextAvailableSlot,
  formatRelativeDateLabel,
  getSlotPeriod,
  groupSlotsByPeriod,
  normalizeSlotRows,
} from "@/lib/booking-date-time-helpers";

describe("booking-date-time-helpers", () => {
  it("builds date options from anchor", () => {
    const anchor = new Date("2026-06-06T12:00:00");
    const opts = buildDateOptions(3, anchor);
    expect(opts).toHaveLength(3);
    expect(opts[0]?.getDate()).toBe(6);
    expect(opts[2]?.getDate()).toBe(8);
  });

  it("formats relative date labels", () => {
    const today = new Date("2026-06-06T12:00:00");
    expect(formatRelativeDateLabel(new Date("2026-06-06"), today)).toBe("Today");
    expect(formatRelativeDateLabel(new Date("2026-06-07"), today)).toBe("Tomorrow");
    expect(formatRelativeDateLabel(new Date("2026-06-10"), today)).toBe("Wed");
  });

  it("groups slots by period", () => {
    const rows = [
      { time: "09:00", available: true },
      { time: "14:00", available: true },
      { time: "18:00", available: false },
    ];
    const groups = groupSlotsByPeriod(rows);
    expect(groups.map((g) => g.period)).toEqual(["morning", "afternoon", "evening"]);
    expect(getSlotPeriod("09:30")).toBe("morning");
    expect(getSlotPeriod("15:00")).toBe("afternoon");
    expect(getSlotPeriod("19:00")).toBe("evening");
  });

  it("finds next available slot after time", () => {
    const rows = [
      { time: "09:00", available: true },
      { time: "10:00", available: false },
      { time: "11:00", available: true },
    ];
    expect(findNextAvailableSlot(rows, "10:30")?.time).toBe("11:00");
    expect(findNextAvailableSlot(rows, null)?.time).toBe("09:00");
  });

  it("normalizes legacy slots array", () => {
    expect(normalizeSlotRows({ slots: ["09:00", "10:00"] })).toEqual([
      { time: "09:00", available: true },
      { time: "10:00", available: true },
    ]);
  });
});
