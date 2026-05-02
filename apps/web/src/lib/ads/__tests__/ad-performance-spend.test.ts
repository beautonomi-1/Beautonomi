import { describe, expect, it } from "vitest";
import {
  effectiveLifetimeSpendRow,
  filterRangeMsFromParams,
  overlapMs,
  timeBasedAttributedSpend,
} from "../ad-performance-spend";

describe("effectiveLifetimeSpendRow", () => {
  it("uses spent for CPC campaigns", () => {
    expect(
      effectiveLifetimeSpendRow({
        billing_model: "cpc_budget",
        budget: 500,
        spent: 120,
        status: "active",
      }),
    ).toBe(120);
  });

  it("uses budget for paid time-based campaigns", () => {
    expect(
      effectiveLifetimeSpendRow({
        billing_model: "time_based",
        budget: 299,
        spent: 0,
        status: "active",
      }),
    ).toBe(299);
  });

  it("returns 0 for time-based draft", () => {
    expect(
      effectiveLifetimeSpendRow({
        billing_model: "time_based",
        budget: 0,
        spent: 0,
        status: "draft",
      }),
    ).toBe(0);
  });
});

describe("timeBasedAttributedSpend", () => {
  it("attributes half the prepaid budget when filter covers half the campaign window", () => {
    const start = new Date("2026-05-01T00:00:00.000Z").getTime();
    const end = new Date("2026-05-11T00:00:00.000Z").getTime();
    const range = filterRangeMsFromParams("2026-05-01", "2026-05-05");
    const attributed = timeBasedAttributedSpend(
      {
        billing_model: "time_based",
        status: "active",
        budget: 100,
        spent: 0,
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
      },
      range,
    );
    expect(attributed).toBeCloseTo(50, 5);
  });

  it("returns 0 when ranges do not overlap", () => {
    const attributed = timeBasedAttributedSpend(
      {
        billing_model: "time_based",
        status: "active",
        budget: 100,
        spent: 0,
        start_at: "2026-06-01T00:00:00.000Z",
        end_at: "2026-06-10T00:00:00.000Z",
      },
      filterRangeMsFromParams("2026-05-01", "2026-05-05"),
    );
    expect(attributed).toBe(0);
  });
});

describe("overlapMs", () => {
  it("computes overlap length", () => {
    expect(overlapMs(0, 100, 50, 150)).toBe(50);
    expect(overlapMs(0, 10, 20, 30)).toBe(0);
  });
});
