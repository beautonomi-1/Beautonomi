import { describe, expect, it } from "vitest";
import {
  buildDashboardPeriodBreakdown,
  buildPeriodSlice,
  countBookingChannelInWindow,
  countBookingStatusInWindow,
  growthPct,
  performanceInWindow,
} from "../build-dashboard-period-breakdown";

const window = {
  start: new Date("2026-06-01T00:00:00.000Z"),
  end: new Date("2026-06-01T23:59:59.999Z"),
};

describe("build-dashboard-period-breakdown", () => {
  it("counts booking channels for scheduled appointments in the window", () => {
    const mix = countBookingChannelInWindow(
      [
        { status: "completed", scheduled_at: "2026-06-01T10:00:00.000Z", booking_source: "online" },
        { status: "confirmed", scheduled_at: "2026-06-01T12:00:00.000Z", booking_source: "walk_in" },
        { status: "completed", scheduled_at: "2026-05-31T10:00:00.000Z", booking_source: "provider" },
      ],
      window,
    );
    expect(mix.online).toBe(1);
    expect(mix.walk_in).toBe(1);
    expect(mix.provider).toBe(0);
  });

  it("counts booking status only for appointments scheduled in the window", () => {
    const status = countBookingStatusInWindow(
      [
        { status: "completed", scheduled_at: "2026-06-01T10:00:00.000Z" },
        { status: "pending", scheduled_at: "2026-06-01T14:00:00.000Z" },
        { status: "completed", scheduled_at: "2026-05-31T10:00:00.000Z" },
      ],
      window,
    );
    expect(status.scheduled_total).toBe(2);
    expect(status.completed).toBe(1);
    expect(status.pending).toBe(1);
  });

  it("counts in_progress appointments as confirmed", () => {
    const status = countBookingStatusInWindow(
      [
        { status: "in_progress", scheduled_at: "2026-06-01T11:00:00.000Z" },
        { status: "confirmed", scheduled_at: "2026-06-01T12:00:00.000Z" },
      ],
      window,
    );
    expect(status.scheduled_total).toBe(2);
    expect(status.confirmed).toBe(2);
  });

  it("computes performance rates for terminal bookings in the window", () => {
    const perf = performanceInWindow(
      [
        { status: "completed", scheduled_at: "2026-06-01T10:00:00.000Z" },
        { status: "no_show", scheduled_at: "2026-06-01T12:00:00.000Z" },
        { status: "cancelled", scheduled_at: "2026-06-01T13:00:00.000Z" },
        { status: "completed", scheduled_at: "2026-05-30T10:00:00.000Z" },
      ],
      window,
    );
    expect(perf.completion_rate).toBeCloseTo(33.333, 1);
    expect(perf.no_show_rate).toBeCloseTo(33.333, 1);
  });

  it("scopes earnings mix and recognized total to ledger created_at in the window", () => {
    const slice = buildPeriodSlice({
      window,
      parsedRows: [
        {
          transaction_type: "provider_earnings",
          amount: 100,
          net: 80,
          created_at: "2026-06-01T12:00:00.000Z",
          booking_id: "b1",
          product_order_id: null,
          description: "Service",
          refund_component: null,
          createdDate: new Date("2026-06-01T12:00:00.000Z"),
          netValue: 80,
          amountValue: 100,
          descriptionText: "Service",
        },
        {
          transaction_type: "tip",
          amount: 10,
          net: 10,
          created_at: "2026-06-01T13:00:00.000Z",
          booking_id: "b1",
          product_order_id: null,
          description: null,
          refund_component: null,
          createdDate: new Date("2026-06-01T13:00:00.000Z"),
          netValue: 10,
          amountValue: 10,
          descriptionText: "",
        },
        {
          transaction_type: "provider_earnings",
          amount: 50,
          net: 50,
          created_at: "2026-05-30T12:00:00.000Z",
          booking_id: "b2",
          product_order_id: null,
          description: "Old",
          refund_component: null,
          createdDate: new Date("2026-05-30T12:00:00.000Z"),
          netValue: 50,
          amountValue: 50,
          descriptionText: "Old",
        },
      ],
      bookings: [],
      revenue: 90,
      appointments: 2,
      retail_sales: 0,
      retail_sales_count: 0,
    });
    expect(slice.earnings_mix.service_earnings).toBe(80);
    expect(slice.earnings_mix.tips).toBe(10);
    expect(slice.earnings_mix.recognized_total).toBe(90);
  });

  it("builds period comparisons with growth percentages", () => {
    const result = buildDashboardPeriodBreakdown({
      parsedRows: [],
      bookings: [],
      windows: {
        today: window,
        this_week: window,
        this_month: window,
        yesterday: window,
        prior_week: window,
        prior_month: window,
      },
      revenue: {
        today: 200,
        this_week: 500,
        this_month: 1200,
        yesterday: 100,
        prior_week: 400,
        prior_month: 1000,
      },
      appointments: {
        today: 4,
        this_week: 10,
        this_month: 30,
        yesterday: 2,
        prior_week: 8,
        prior_month: 25,
      },
      retail: {
        today: { amount: 50, count: 1 },
        this_week: { amount: 120, count: 3 },
        this_month: { amount: 300, count: 8 },
      },
    });
    expect(result.period_breakdown.today.revenue).toBe(200);
    expect(result.period_comparison.today.revenue_growth_pct).toBe(100);
    expect(result.period_comparison.this_week.appointments_growth_pct).toBe(25);
    expect(growthPct(0, 0)).toBe(0);
  });
});
