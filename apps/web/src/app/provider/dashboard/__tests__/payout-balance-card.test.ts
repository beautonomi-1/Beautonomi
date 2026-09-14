import { describe, expect, it } from "vitest";
import { buildPayoutBalanceCardView } from "../payout-balance-card";
import type { ProviderDashboardStats } from "../provider-dashboard-stats";

const baseStats = {
  total_bookings: 0,
  active_bookings: 0,
  confirmed_bookings: 0,
  completed_bookings: 0,
  cancelled_bookings: 0,
  no_show_bookings: 0,
  pending_bookings: 0,
  at_home_bookings: 0,
  at_salon_bookings: 0,
  at_home_completed: 0,
  at_salon_completed: 0,
  at_home_confirmed: 0,
  at_salon_confirmed: 0,
  at_home_pending: 0,
  at_salon_pending: 0,
  at_home_cancelled: 0,
  at_salon_cancelled: 0,
  at_home_no_show: 0,
  at_salon_no_show: 0,
  revenue_this_month: 0,
  revenue_this_week: 0,
  revenue_today: 0,
  revenue_growth: 0,
  lifetime_revenue: 0,
  available_balance: 1250.5,
  pending_payments_amount: 0,
  pending_payments_count: 0,
  service_earnings_total: 0,
  travel_fees_total: 0,
  travel_fees_today: 0,
  travel_fees_this_month: 0,
  travel_fees_last_month: 0,
  completion_rate: 0,
  no_show_rate: 0,
  average_rating: 0,
  total_reviews: 0,
  appointments_today: 0,
  appointments_this_week: 0,
  appointments_this_month: 0,
} satisfies ProviderDashboardStats;

const fmt = (n: number) => `R${n.toFixed(2)}`;

const t = (key: string, params?: Record<string, string | number>) => {
  const map: Record<string, string> = {
    "web.provider.dashboard.payoutBalance.availableToWithdraw": "Available to withdraw",
    "web.provider.dashboard.payoutBalance.balanceOwed": "Balance owed",
    "web.provider.dashboard.payoutBalance.owedToPlatformReview": "{{prefix}}Owed to platform — review in Finance",
    "web.provider.dashboard.payoutBalance.platformHeldReady": "{{prefix}}Platform-held · ready to request payout",
    "web.provider.dashboard.payoutBalance.payoutQueue": "{{prefix}}{{amount}} in payout queue",
    "web.provider.dashboard.payoutBalance.holdOnEarnings": "{{prefix}}{{days}}-day hold on new earnings",
    "web.provider.dashboard.payoutBalance.allLocationsPrefix": "All locations · ",
  };
  let out = map[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(`{{${k}}}`, String(v));
    }
  }
  return out;
};

describe("buildPayoutBalanceCardView", () => {
  it("uses finance-aligned available balance with finance link", () => {
    const view = buildPayoutBalanceCardView(baseStats, fmt, t);
    expect(view.title).toBe("Available to withdraw");
    expect(view.value).toBe(1250.5);
    expect(view.href).toBe("/provider/finance");
    expect(view.subtitle).toContain("Platform-held");
  });

  it("shows pending payout queue in subtitle", () => {
    const view = buildPayoutBalanceCardView(
      { ...baseStats, pending_payout_queue: 200 },
      fmt,
      t,
    );
    expect(view.subtitle).toContain("R200.00");
    expect(view.subtitle).toContain("payout queue");
  });

  it("shows hold days when configured", () => {
    const view = buildPayoutBalanceCardView(
      { ...baseStats, payout_hold_days: 7 },
      fmt,
      t,
    );
    expect(view.subtitle).toContain("7-day hold");
  });

  it("surfaces balance owed when ledger is negative", () => {
    const view = buildPayoutBalanceCardView(
      {
        ...baseStats,
        available_balance: 0,
        has_negative_payout_balance: true,
        balance_owed_to_platform: 42,
      },
      fmt,
      t,
    );
    expect(view.title).toBe("Balance owed");
    expect(view.value).toBe(42);
    expect(view.href).toBe("/provider/finance");
  });

  it("notes all-locations scope when a location filter is active", () => {
    const view = buildPayoutBalanceCardView(baseStats, fmt, t, { locationFiltered: true });
    expect(view.subtitle.startsWith("All locations ·")).toBe(true);
  });
});
