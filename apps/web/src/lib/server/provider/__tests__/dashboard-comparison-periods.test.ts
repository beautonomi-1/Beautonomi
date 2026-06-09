import { describe, expect, it } from "vitest";
import {
  getPriorMonthMtdComparisonBounds,
  getPriorWeekComparisonBounds,
} from "../dashboard-comparison-periods";

const TZ = "Africa/Johannesburg";

describe("dashboard-comparison-periods", () => {
  it("aligns prior week to the same elapsed days as the current partial week", () => {
    // Thursday 2026-06-05; week starts Sunday 2026-06-01 → 4 days into week
    const businessNow = new Date("2026-06-05T10:00:00.000Z");
    const startOfWeekLocal = new Date(2026, 5, 1); // June 1 2026 (Sunday in local construction)
    const bounds = getPriorWeekComparisonBounds({
      timezone: TZ,
      businessNow,
      startOfWeekLocal,
    });
    expect(bounds.label).toBe("last week (same days)");
    expect(bounds.end.getTime()).toBeGreaterThan(bounds.start.getTime());
  });

  it("aligns prior month to MTD through the same civil day last month", () => {
    const businessNow = new Date("2026-06-05T10:00:00.000Z");
    const bounds = getPriorMonthMtdComparisonBounds({
      timezone: TZ,
      businessNow,
    });
    expect(bounds.label).toBe("last month (to date)");
    expect(bounds.end.getTime()).toBeGreaterThanOrEqual(bounds.start.getTime());
  });
});
