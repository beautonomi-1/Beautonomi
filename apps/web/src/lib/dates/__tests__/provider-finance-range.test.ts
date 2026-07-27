import { describe, expect, it } from "vitest";
import { resolveProviderFinanceRangeBounds } from "../provider-finance-range";

describe("resolveProviderFinanceRangeBounds", () => {
  const tz = "Africa/Johannesburg";
  const now = new Date("2026-07-25T12:00:00.000Z");

  it("uses calendar week Mon-today for week range", () => {
    const bounds = resolveProviderFinanceRangeBounds("week", tz, now);
    expect(bounds.label).toContain("This week");
    expect(bounds.startIso.length).toBeGreaterThan(10);
  });

  it("uses Jan 1-today for year range", () => {
    const bounds = resolveProviderFinanceRangeBounds("year", tz, now);
    expect(bounds.label).toBe("This year");
    expect(new Date(bounds.startIso).getTime()).toBeLessThan(now.getTime());
  });

  it("uses today only for today range", () => {
    const bounds = resolveProviderFinanceRangeBounds("today", tz, now);
    expect(bounds.label).toBe("Today");
  });
});
