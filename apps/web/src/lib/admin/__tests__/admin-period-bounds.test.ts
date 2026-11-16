import { describe, expect, it } from "vitest";
import { adminPeriodBounds, resolveAdminTimeZone } from "../admin-period-bounds";

describe("adminPeriodBounds", () => {
  it("uses UTC when timezone is missing or invalid", () => {
    expect(resolveAdminTimeZone(null)).toBe("UTC");
    expect(resolveAdminTimeZone("Not/AZone")).toBe("UTC");
    const now = new Date("2026-11-16T08:55:00.000Z");
    const bounds = adminPeriodBounds(now, null);
    expect(bounds.timeZone).toBe("UTC");
    expect(bounds.startOfMonth.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(bounds.startOfToday.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(bounds.startOfPreviousMonth.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(bounds.endOfPreviousMonth.toISOString()).toBe("2026-10-31T23:59:59.999Z");
  });

  it("starts the SAST month at 22:00 UTC the previous day", () => {
    const now = new Date("2026-11-16T08:55:00.000Z");
    const bounds = adminPeriodBounds(now, "Africa/Johannesburg");
    expect(bounds.startOfMonth.toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(bounds.startOfToday.toISOString()).toBe("2026-11-15T22:00:00.000Z");
  });
});
