import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUS_ORDER,
  bookingStatusBarRows,
  bookingStatusBreakdownFromReport,
  buildRevenueMixSegments,
  mixTotal,
  qualityShareSentence,
  shareOfTotal,
  sumTimeSeriesCount,
  sumTimeSeriesRevenue,
} from "./analyticsPageMetrics";

describe("analyticsPageMetrics", () => {
  it("sums time series", () => {
    expect(sumTimeSeriesCount([{ date: "a", count: 2 }, { date: "b", count: 3 }])).toBe(5);
    expect(sumTimeSeriesRevenue([{ revenue: 10 }, { revenue: 5 }])).toBe(15);
  });

  it("mix segments sum to platform net components", () => {
    const streams = {
      booking_commission: 100,
      subscriptions: 50,
      ads: 10,
      service_fees: 5,
      marketing_credits: 2,
      gift_card_breakage: 1,
    };
    const segments = buildRevenueMixSegments(streams);
    expect(mixTotal(segments)).toBe(168);
    expect(shareOfTotal(100, 168)).toBeCloseTo(59.52, 1);
  });

  it("booking status bars follow lifecycle order", () => {
    const rows = bookingStatusBarRows({
      scheduled_total: 100,
      completed: 50,
      pending: 30,
      confirmed: 20,
    });
    expect(rows.map((r) => r.label)).toEqual([
      "Pending",
      "Confirmed",
      "Completed",
    ]);
    expect(rows[0]?.hint).toBe("(30.0%)");
    expect(BOOKING_STATUS_ORDER.indexOf("pending")).toBeLessThan(
      BOOKING_STATUS_ORDER.indexOf("confirmed"),
    );
  });

  it("maps booking report status rows into analytics breakdown", () => {
    const breakdown = bookingStatusBreakdownFromReport(
      [
        { status: "completed", count: 2 },
        { status: "unknown", count: 1 },
      ],
      3,
    );
    expect(breakdown.scheduled_total).toBe(3);
    expect(breakdown.completed).toBe(2);
    expect(breakdown.other).toBe(1);
  });

  it("quality shares use scheduled_total", () => {
    const q = qualityShareSentence({
      scheduled_total: 100,
      cancelled: 10,
      no_show: 5,
    });
    expect(q?.cancelPct).toBe("10.0%");
    expect(q?.noShowPct).toBe("5.0%");
  });
});
