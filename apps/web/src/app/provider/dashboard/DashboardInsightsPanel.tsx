"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  Footprints,
  ShoppingBag,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Calendar,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type {
  ProviderDashboardStats,
  DashboardPeriodSlice,
  DashboardPeriodComparison,
} from "./provider-dashboard-stats";

type PeriodChip = "today" | "week" | "month";
type PeriodApiKey = "today" | "this_week" | "this_month";

const PERIOD_OPTIONS: { label: string; value: PeriodChip }[] = [
  { label: "Today", value: "today" },
  { label: "This week", value: "week" },
  { label: "This month", value: "month" },
];

function periodApiKey(chip: PeriodChip): PeriodApiKey {
  if (chip === "week") return "this_week";
  if (chip === "month") return "this_month";
  return "today";
}

function periodLabel(chip: PeriodChip): string {
  if (chip === "week") return "This week";
  if (chip === "month") return "This month";
  return "Today";
}

function legacyPeriodSlice(stats: ProviderDashboardStats, chip: PeriodChip): DashboardPeriodSlice {
  const revenue =
    chip === "today"
      ? stats.revenue_today ?? 0
      : chip === "week"
        ? stats.revenue_this_week ?? 0
        : stats.revenue_this_month ?? 0;
  const appointments =
    chip === "today"
      ? stats.appointments_today ?? 0
      : chip === "week"
        ? stats.appointments_this_week ?? 0
        : stats.appointments_this_month ?? 0;
  return {
    revenue,
    appointments,
    retail_sales: 0,
    retail_sales_count: 0,
    earnings_mix: {
      service_earnings: stats.service_earnings_total ?? 0,
      product_order_earnings: stats.product_order_earnings_total ?? 0,
      membership_earnings: 0,
      additional_charge_earnings: stats.additional_charge_earnings_total ?? 0,
      other_earnings: stats.other_earnings_total ?? 0,
      tips: stats.tips_total ?? 0,
      travel_fees: stats.travel_fees_total ?? 0,
      gift_card_sales: stats.gift_card_sales_total ?? 0,
      membership_sales: stats.membership_sales_total ?? 0,
      refunds: stats.refunds_total ?? 0,
      recognized_total: stats.recognized_earnings_total ?? revenue,
    },
    booking_status: {
      pending: stats.pending_bookings ?? 0,
      confirmed: stats.confirmed_bookings ?? 0,
      completed: stats.completed_bookings ?? 0,
      cancelled: stats.cancelled_bookings ?? 0,
      no_show: stats.no_show_bookings ?? 0,
      scheduled_total: appointments,
    },
    performance: {
      completion_rate: stats.completion_rate ?? 0,
      no_show_rate: stats.no_show_rate ?? 0,
    },
  };
}

function GrowthBadge({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-xs text-gray-500">vs prior period</span>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-green-600" : "text-red-600"}`}>
      <Icon className="h-3.5 w-3.5" />
      {up ? "+" : ""}
      {pct.toFixed(0)}% vs prior
    </span>
  );
}

export function DashboardInsightsPanel({
  stats,
  tenantCurrency,
}: {
  stats: ProviderDashboardStats;
  tenantCurrency: string;
}) {
  const router = useRouter();
  const [periodChip, setPeriodChip] = useState<PeriodChip>("today");

  const periodKey = periodApiKey(periodChip);
  const activePeriod = useMemo(
    () => stats.period_breakdown?.[periodKey] ?? legacyPeriodSlice(stats, periodChip),
    [stats, periodKey, periodChip],
  );
  const activeComparison: DashboardPeriodComparison | null =
    stats.period_comparison?.[periodKey] ?? null;
  const insights = stats.insights;
  const periodTitle = periodLabel(periodChip).toLowerCase();

  const channelTotal =
    (activePeriod.channel_mix?.online ?? 0) +
    (activePeriod.channel_mix?.walk_in ?? 0) +
    (activePeriod.channel_mix?.provider ?? 0);

  const maxChartRevenue = Math.max(
    ...(insights?.weekly_revenue ?? []).map((d) => d.revenue),
    1,
  );

  return (
    <div className="space-y-4 sm:space-y-6 mb-4 sm:mb-6">
      {stats.booking_eligibility?.can_accept_online_bookings === false && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div>
            <p className="text-sm font-semibold text-amber-900">Online bookings paused</p>
            <p className="mt-0.5 text-sm text-amber-700">
              {stats.booking_eligibility.booking_limit_message ??
                "Upgrade your subscription to accept more online bookings."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 bg-white shrink-0"
            onClick={() => router.push("/provider/subscription")}
          >
            Manage subscription
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPeriodChip(opt.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              periodChip === opt.value
                ? "bg-gray-900 text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            aria-pressed={periodChip === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-white p-4" aria-label={`Revenue earned ${periodTitle}`}>
          <p className="text-xs text-gray-500 mb-1">Revenue earned ({periodTitle})</p>
          <p className="text-2xl font-semibold">{formatCurrency(activePeriod.revenue, tenantCurrency)}</p>
          {activeComparison ? <GrowthBadge pct={activeComparison.revenue_growth_pct} /> : null}
          <p className="text-xs text-gray-400 mt-1">Payment date basis</p>
        </div>
        <div className="rounded-lg border bg-white p-4" aria-label={`Appointments ${periodTitle}`}>
          <p className="text-xs text-gray-500 mb-1">Appointments ({periodTitle})</p>
          <p className="text-2xl font-semibold">{activePeriod.appointments}</p>
          {activeComparison ? <GrowthBadge pct={activeComparison.appointments_growth_pct} /> : null}
          <p className="text-xs text-gray-400 mt-1">Scheduled date basis</p>
        </div>
        <div className="rounded-lg border bg-white p-4" aria-label={`Retail sales ${periodTitle}`}>
          <p className="text-xs text-gray-500 mb-1">Retail sales ({periodTitle})</p>
          <p className="text-2xl font-semibold">
            {formatCurrency(activePeriod.retail_sales, tenantCurrency)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {activePeriod.retail_sales_count} sale{activePeriod.retail_sales_count === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {channelTotal > 0 ? (
        <div className="rounded-lg border bg-white p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Appointments by channel ({periodTitle})
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            Appointment counts — not revenue. Channel earnings are in Reports → Bookings.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["Online", activePeriod.channel_mix?.online ?? 0, "text-blue-600"],
                ["Walk-in", activePeriod.channel_mix?.walk_in ?? 0, "text-amber-600"],
                ["Provider", activePeriod.channel_mix?.provider ?? 0, "text-violet-600"],
              ] as const
            ).map(([label, count, color]) => (
              <div key={label} className="text-center rounded-lg border border-gray-100 p-3" aria-label={`${count} ${label} bookings`}>
                <p className={`text-xl font-bold ${color}`}>{count}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-gray-900 hover:bg-gray-800"
          onClick={() => router.push("/provider/calendar?new=1")}
          aria-label="Create new booking"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/provider/calendar?walk_in=true")}
          aria-label="Create walk-in appointment"
        >
          <Footprints className="h-4 w-4 mr-1.5" />
          Walk-in appt
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/provider/ecommerce/walk-in")}
          aria-label="Start retail product sale"
        >
          <ShoppingBag className="h-4 w-4 mr-1.5" />
          Retail
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/provider/ecommerce/walk-in")}
          aria-label="Open sell and point of sale"
        >
          <CreditCard className="h-4 w-4 mr-1.5" />
          Sell / POS
        </Button>
      </div>

      {insights?.weekly_revenue && insights.weekly_revenue.length > 0 ? (
        <div className="rounded-lg border bg-white p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Earnings trend (last 7 days)</h3>
          <div className="flex items-end gap-2 h-32" role="img" aria-label="Seven day revenue chart">
            {insights.weekly_revenue.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full">
                <div
                  className="w-full rounded-t bg-indigo-400 min-h-[4px]"
                  style={{ height: `${Math.max(4, (d.revenue / maxChartRevenue) * 100)}%` }}
                  title={`${d.day}: ${formatCurrency(d.revenue, tenantCurrency)}`}
                />
                <span className="text-[10px] text-gray-400 mt-1 truncate w-full text-center">
                  {format(new Date(`${d.day}T12:00:00`), "EEE")}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {insights?.upcoming_bookings && insights.upcoming_bookings.length > 0 ? (
          <div className="rounded-lg border bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                Upcoming (next 7 days)
              </h3>
              <Button variant="ghost" size="sm" onClick={() => router.push("/provider/calendar")}>
                View calendar
              </Button>
            </div>
            <div className="space-y-2">
              {insights.upcoming_bookings.slice(0, 7).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="w-full text-left rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
                  onClick={() =>
                    router.push(
                      b.is_group_booking && b.group_booking_id
                        ? `/provider/group-bookings/${b.group_booking_id}`
                        : `/provider/bookings/${b.id}`,
                    )
                  }
                  aria-label={`Upcoming booking ${b.customers?.full_name ?? "Walk-in"}`}
                >
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {b.customers?.full_name ?? "Walk-in"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(b.scheduled_at), "EEE, MMM d · h:mm a")}
                      </p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">
                      {formatCurrency(b.total_amount, b.currency || tenantCurrency)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-gray-50 p-6 text-center text-sm text-gray-500">
            No upcoming appointments in the next 7 days
          </div>
        )}

        {insights?.top_services && insights.top_services.length > 0 ? (
          <div className="rounded-lg border bg-white p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Top services (last 30 days)</h3>
            <p className="text-xs text-gray-500 mb-3">Fixed 30-day window</p>
            <div className="space-y-3">
              {insights.top_services.map((svc, idx) => {
                const maxRev = insights.top_services[0]?.total_revenue || 1;
                const width = (svc.total_revenue / maxRev) * 100;
                return (
                  <div key={`${svc.service_name}-${idx}`}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-900 truncate pr-2">{svc.service_name}</span>
                      <span className="font-semibold shrink-0">
                        {formatCurrency(svc.total_revenue, tenantCurrency)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${width}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{svc.booking_count} bookings</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-gray-50 p-6 text-center text-sm text-gray-500">
            No service data yet
          </div>
        )}
      </div>

      {insights?.recent_activity && insights.recent_activity.length > 0 ? (
        <div className="rounded-lg border bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Activity className="h-4 w-4 text-gray-500" />
              Recent activity
            </h3>
            <Button variant="ghost" size="sm" onClick={() => router.push("/provider/bookings")}>
              View all
            </Button>
          </div>
          {insights.basis?.activity_window ? (
            <p className="text-xs text-gray-500 mb-3">{insights.basis.activity_window}</p>
          ) : null}
          <div className="divide-y divide-gray-100">
            {insights.recent_activity.slice(0, 8).map((item) => (
              <button
                key={item.id}
                type="button"
                className="w-full text-left py-3 hover:bg-gray-50 transition-colors px-1"
                onClick={() => {
                  if (item.data?.booking_id) router.push(`/provider/bookings/${item.data.booking_id}`);
                  else if (item.data?.product_order_id)
                    router.push(`/provider/ecommerce/orders`);
                }}
                aria-label={item.description}
              >
                <p className="text-sm text-gray-900">{item.description}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(new Date(item.created_at), "MMM d, h:mm a")}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {(stats.bookings_truncated || stats.ledger_truncated) && (
        <p className="text-xs text-gray-500 px-1">
          {stats.bookings_truncated && stats.ledger_truncated
            ? "Some booking and ledger totals may be incomplete for very high-volume accounts."
            : stats.bookings_truncated
              ? "Booking status counts may be incomplete for very high-volume accounts."
              : "Period earnings may be incomplete for very high-volume accounts."}
        </p>
      )}

      {stats.metrics_time_basis ? (
        <p className="text-xs text-gray-400 px-1">{stats.metrics_time_basis}</p>
      ) : null}
    </div>
  );
}
