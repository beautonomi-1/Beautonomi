import { describe, expect, it } from "vitest";
import { fiscalQuarterBounds, resolveUtcPeriod } from "../periods";

describe("brand periods", () => {
  it("uses UTC month boundaries", () => {
    const p = resolveUtcPeriod("this_month", undefined, undefined, new Date("2026-03-15T12:00:00Z"));
    expect(p.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("fiscal Q1 starting March runs Mar–May", () => {
    const { start, end } = fiscalQuarterBounds(new Date("2026-04-10T00:00:00Z"), 3);
    expect(start.getUTCMonth()).toBe(2);
    expect(end.getUTCMonth()).toBe(4);
  });
});
