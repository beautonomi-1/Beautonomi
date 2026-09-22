import { describe, expect, it } from "vitest";
import { getLocationOpenState, getWeeklyHoursRows } from "../locationOpenState";

describe("getLocationOpenState", () => {
  it("returns unknown for empty hours", () => {
    expect(getLocationOpenState({})).toEqual({ status: "unknown" });
    expect(getLocationOpenState(null)).toEqual({ status: "unknown" });
  });

  it("returns open when now is inside monday 09:00-17:00 in Johannesburg", () => {
    const hours = {
      monday: { open: "09:00", close: "17:00", closed: false },
    };
    // Monday 2026-04-20 12:00 SAST = 10:00 UTC
    const now = new Date("2026-04-20T10:00:00.000Z");
    const state = getLocationOpenState(hours, now, "Africa/Johannesburg");
    expect(state.status).toBe("open");
    expect(state.closeMin).toBe(17 * 60);
  });

  it("supports mobile open_time / close_time shape", () => {
    const hours = {
      tuesday: { open_time: "09:00", close_time: "17:00", is_open: true },
    };
    const now = new Date("2026-04-21T10:00:00.000Z"); // Tue noon SAST
    const state = getLocationOpenState(hours, now, "Africa/Johannesburg");
    expect(state.status).toBe("open");
  });
});

describe("getWeeklyHoursRows", () => {
  it("marks days without data as unknown", () => {
    const rows = getWeeklyHoursRows({});
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.status === "unknown")).toBe(true);
  });
});
