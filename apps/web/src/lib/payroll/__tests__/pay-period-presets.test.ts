import { describe, expect, it } from "vitest";
import { boundsForPayPeriodPreset } from "../pay-period-presets";

const anchor = new Date(2026, 9, 20); // Oct 20, 2026

describe("boundsForPayPeriodPreset", () => {
  it("weekly (Mon–Sun week containing anchor)", () => {
    const { start, end } = boundsForPayPeriodPreset("weekly", anchor);
    expect(start).toBe("2026-10-19");
    expect(end).toBe("2026-10-25");
  });

  it("biweekly (14-day window ending anchor)", () => {
    const { start, end } = boundsForPayPeriodPreset("biweekly", anchor);
    expect(start).toBe("2026-10-07");
    expect(end).toBe("2026-10-20");
  });

  it("semi_monthly second half when day > 15", () => {
    const { start, end } = boundsForPayPeriodPreset("semi_monthly", anchor);
    expect(start).toBe("2026-10-16");
    expect(end).toBe("2026-10-31");
  });

  it("semi_monthly first half when day <= 15", () => {
    const early = new Date(2026, 9, 10);
    const { start, end } = boundsForPayPeriodPreset("semi_monthly", early);
    expect(start).toBe("2026-10-01");
    expect(end).toBe("2026-10-15");
  });

  it("monthly full calendar month", () => {
    const { start, end } = boundsForPayPeriodPreset("monthly", anchor);
    expect(start).toBe("2026-10-01");
    expect(end).toBe("2026-10-31");
  });

  it("custom falls back to 7-day window ending anchor", () => {
    const { start, end } = boundsForPayPeriodPreset("custom", anchor);
    expect(start).toBe("2026-10-14");
    expect(end).toBe("2026-10-20");
  });
});
