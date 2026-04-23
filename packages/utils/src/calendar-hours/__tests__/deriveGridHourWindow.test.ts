import { describe, expect, it } from "vitest";
import { deriveGridHourWindow } from "../deriveGridHourWindow";

const monday = new Date("2026-04-20T12:00:00Z");
const tuesday = new Date("2026-04-21T12:00:00Z");

describe("deriveGridHourWindow", () => {
  it("falls back to defaults when nothing is open", () => {
    const r = deriveGridHourWindow({
      visibleDates: [monday],
      defaultStartHour: 8,
      defaultEndHour: 20,
    });
    expect(r).toEqual({ startHour: 8, endHour: 20, hasAnyOpenSlot: false });
  });

  it("pads +/-1 hour around location hours and clamps to 0/23", () => {
    const r = deriveGridHourWindow({
      visibleDates: [monday],
      locationOperatingHours: { monday: { open: "09:00", close: "17:00" } },
    });
    expect(r).toEqual({ startHour: 8, endHour: 18, hasAnyOpenSlot: true });
  });

  it("unions location + staff working hours when staff shift extends range", () => {
    const r = deriveGridHourWindow({
      visibleDates: [monday],
      locationOperatingHours: { monday: { open: "10:00", close: "17:00" } },
      staffWorkingHours: [{ monday: { open: "07:00", close: "20:00" } }],
    });
    expect(r.startHour).toBe(6);
    expect(r.endHour).toBe(21);
  });

  it("honours staff-only weekend shifts even if location is closed", () => {
    const saturday = new Date("2026-04-25T12:00:00Z");
    const r = deriveGridHourWindow({
      visibleDates: [saturday],
      locationOperatingHours: { saturday: { closed: true } },
      staffWorkingHours: [{ saturday: { open: "10:00", close: "14:00" } }],
    });
    expect(r.hasAnyOpenSlot).toBe(true);
    expect(r.startHour).toBe(9);
    expect(r.endHour).toBe(15);
  });

  it("extends range to include a late event on a visible date", () => {
    const r = deriveGridHourWindow({
      visibleDates: [monday],
      locationOperatingHours: { monday: { open: "09:00", close: "17:00" } },
      events: [{ date: "2026-04-20", startMin: 19 * 60, endMin: 20 * 60 }],
    });
    expect(r.endHour).toBeGreaterThanOrEqual(20);
  });

  it("ignores events on non-visible dates", () => {
    const r = deriveGridHourWindow({
      visibleDates: [monday],
      locationOperatingHours: { monday: { open: "09:00", close: "17:00" } },
      events: [{ date: "2026-04-22", startMin: 0, endMin: 60 }],
    });
    expect(r.startHour).toBe(8);
    expect(r.endHour).toBe(18);
  });

  it("picks up overnight staff on the wrap-around day", () => {
    const r = deriveGridHourWindow({
      visibleDates: [tuesday],
      staffWorkingHours: [{ monday: { open: "22:00", close: "02:00" } }],
    });
    expect(r.startHour).toBe(0);
    expect(r.endHour).toBeGreaterThanOrEqual(3);
    expect(r.hasAnyOpenSlot).toBe(true);
  });

  it("clamps to [0, 23] when padding overflows", () => {
    const r = deriveGridHourWindow({
      visibleDates: [monday],
      locationOperatingHours: { monday: { open: "00:00", close: "23:30" } },
    });
    expect(r.startHour).toBe(0);
    expect(r.endHour).toBe(23);
  });
});
