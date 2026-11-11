import { describe, expect, it } from "vitest";
import {
  redactDashboardCustomerContact,
  redactDashboardSalonMoney,
} from "@/lib/server/provider/redact-dashboard-salon-money";

describe("redactDashboardSalonMoney", () => {
  it("zeros salon money and keeps appointment counts", () => {
    const redacted = redactDashboardSalonMoney({
      appointments_today: 4,
      revenue_today: 250,
      available_balance: 80,
      has_negative_payout_balance: true,
      period_breakdown: {
        today: { revenue: 250, appointments: 4, retail_sales: 20, earnings_mix: { tips: 15 } },
      },
      insights: {
        weekly_revenue: [{ day: "2026-11-10", revenue: 250 }],
        top_services: [{ service_name: "Cut", booking_count: 3, total_revenue: 250 }],
      },
    });

    expect(redacted.appointments_today).toBe(4);
    expect(redacted.revenue_today).toBe(0);
    expect(redacted.available_balance).toBe(0);
    expect(redacted.has_negative_payout_balance).toBe(false);
    expect(redacted.period_breakdown.today.revenue).toBe(0);
    expect(redacted.period_breakdown.today.appointments).toBe(4);
    expect(redacted.period_breakdown.today.earnings_mix.tips).toBe(0);
    expect(redacted.insights.weekly_revenue[0].revenue).toBe(0);
    expect(redacted.insights.top_services[0].total_revenue).toBe(0);
    expect(redacted.insights.top_services[0].booking_count).toBe(3);
  });

  it("drops customer phones on today's and upcoming appointments and keeps names", () => {
    const payload = {
      insights: {
        today_bookings: [{ id: "b1", customers: { full_name: "Ada", phone: "0820000000" } }],
        upcoming_bookings: [{ id: "g1", customers: { full_name: "Bea", phone: "0830000000" } }],
      },
    };
    const redacted = redactDashboardCustomerContact(payload);
    expect(redacted.insights.today_bookings[0].customers.full_name).toBe("Ada");
    expect(redacted.insights.today_bookings[0].customers.phone).toBeNull();
    expect(redacted.insights.upcoming_bookings[0].customers.phone).toBeNull();
    expect(payload.insights.today_bookings[0].customers.phone).toBe("0820000000");
  });
});
