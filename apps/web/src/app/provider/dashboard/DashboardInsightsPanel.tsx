"use client";
import { useTranslation } from "@beautonomi/i18n";

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
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { formatCurrency } from "@/lib/utils";
import type {
  ProviderDashboardStats,
  DashboardPeriodSlice,
  DashboardPeriodComparison,
} from "./provider-dashboard-stats";

type PeriodChip = "today" | "week" | "month";
type PeriodApiKey = "today" | "this_week" | "this_month";

const PERIOD_OPTIONS: { value: PeriodChip }[] = [
  { value: "today" },
  { value: "week" },
  { value: "month" },
];

function periodApiKey(chip: PeriodChip): PeriodApiKey {
  if (chip === "week") return "this_week";
  if (chip === "month") return "this_month";
  return "today";
}

function periodChipLabel(chip: PeriodChip, t: (key: string) => string): string {
  if (chip === "week") return t("web.provider.dashboard.insights.periodWeek");
  if (chip === "month") return t("web.provider.dashboard.insights.periodMonth");
  return t("web.provider.dashboard.insights.periodToday");
}

function periodTitleLabel(chip: PeriodChip, t: (key: string) => string): string {
  if (chip === "week") return t("web.provider.dashboard.insights.periodTitleWeek");
  if (chip === "month") return t("web.provider.dashboard.insights.periodTitleMonth");
  return t("web.provider.dashboard.insights.periodTitleToday");
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
  const { t } = useTranslation();
  if (pct === 0) return <span className="text-xs text-gray-500">{t("web.provider.reports.common.vsPriorPeriod")}</span>;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-green-600" : "text-red-600"}`}>
      <Icon className="h-3.5 w-3.5" />
      {up ? "+" : ""}
      {t("web.provider.dashboard.insights.vsPrior", { pct: pct.toFixed(0) })}
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
  const { t } = useTranslation();
  const router = useRouter();
  const unifiedPosEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS);
  const [periodChip, setPeriodChip] = useState<PeriodChip>("today");

  const periodKey = periodApiKey(periodChip);
  const activePeriod = useMemo(
    () => stats.period_breakdown?.[periodKey] ?? legacyPeriodSlice(stats, periodChip),
    [stats, periodKey, periodChip],
  );
  const activeComparison: DashboardPeriodComparison | null =
    stats.period_comparison?.[periodKey] ?? null;
  const insights = stats.insights;
  const periodTitle = periodTitleLabel(periodChip, t);

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
            <p className="text-sm font-semibold text-amber-900">{t("web.provider.dashboard.insights.onlinePaused")}</p>
            <p className="mt-0.5 text-sm text-amber-700">
              {stats.booking_eligibility.booking_limit_message ??
t("web.provider.dashboard.insights.onlinePausedDefault")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 bg-white shrink-0"
            onClick={() => router.push("/provider/subscription")}
          >
            {t("web.provider.settings.pages.calendar-integration.viewPlans")}
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
            {periodChipLabel(opt.value, t)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-white p-4" aria-label={t("web.provider.dashboard.insights.revenueA11y", { period: periodTitle })}>
          <p className="text-xs text-gray-500 mb-1">{t("web.provider.dashboard.insights.revenueEarned", { period: periodTitle })}</p>
          <p className="text-2xl font-semibold">{formatCurrency(activePeriod.revenue, tenantCurrency)}</p>
          {activeComparison ? <GrowthBadge pct={activeComparison.revenue_growth_pct} /> : null}
          <p className="text-xs text-gray-400 mt-1">{t("web.provider.dashboard.insights.paymentDateBasis")}</p>
        </div>
        <div className="rounded-lg border bg-white p-4" aria-label={t("web.provider.dashboard.insights.appointmentsA11y", { period: periodTitle })}>
          <p className="text-xs text-gray-500 mb-1">{t("web.provider.dashboard.insights.appointments", { period: periodTitle })}</p>
          <p className="text-2xl font-semibold">{activePeriod.appointments}</p>
          {activeComparison ? <GrowthBadge pct={activeComparison.appointments_growth_pct} /> : null}
          <p className="text-xs text-gray-400 mt-1">{t("web.provider.dashboard.insights.scheduledDateBasis")}</p>
        </div>
        <div className="rounded-lg border bg-white p-4" aria-label={t("web.provider.dashboard.insights.retailA11y", { period: periodTitle })}>
          <p className="text-xs text-gray-500 mb-1">{t("web.provider.dashboard.insights.retailSales", { period: periodTitle })}</p>
          <p className="text-2xl font-semibold">
            {formatCurrency(activePeriod.retail_sales, tenantCurrency)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
{t("web.provider.dashboard.insights.saleCount", { count: activePeriod.retail_sales_count })}
          </p>
        </div>
      </div>

      {channelTotal > 0 ? (
        <div className="rounded-lg border bg-white p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
{t("web.provider.dashboard.insights.appointmentsByChannel", { period: periodTitle })}
          </h3>
          <p className="text-xs text-gray-400 mb-3">
{t("web.provider.dashboard.insights.channelHint")}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                [t("web.provider.dashboard.insights.online"), activePeriod.channel_mix?.online ?? 0, "text-blue-600", "online"],
                [t("web.provider.dashboard.insights.walkIn"), activePeriod.channel_mix?.walk_in ?? 0, "text-amber-600", "walk-in"],
                [t("web.provider.dashboard.insights.provider"), activePeriod.channel_mix?.provider ?? 0, "text-violet-600", "provider"],
              ] as const
            ).map(([label, count, color, key]) => (
              <div key={key} className="text-center rounded-lg border border-gray-100 p-3" aria-label={t("web.provider.dashboard.insights.channelBookingsA11y", { count, label })}>
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
          aria-label={t("web.provider.dashboard.insights.newBookingA11y")}
        >
          <Plus className="h-4 w-4 me-1.5" />
          {t("web.provider.dashboard.insights.new")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/provider/calendar?walk_in=true")}
          aria-label={t("web.provider.dashboard.insights.walkInApptA11y")}
        >
          <Footprints className="h-4 w-4 me-1.5" />
          {t("web.provider.dashboard.insights.walkInAppt")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/provider/ecommerce/walk-in")}
          aria-label={t("web.provider.dashboard.insights.retailBtnA11y")}
        >
          <ShoppingBag className="h-4 w-4 me-1.5" />
          {t("web.provider.dashboard.insights.retail")}
        </Button>
        {unifiedPosEnabled ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push("/provider/sales")}
          aria-label={t("web.provider.dashboard.insights.sellPosA11y")}
        >
          <CreditCard className="h-4 w-4 me-1.5" />
          {t("web.provider.dashboard.insights.sellPos")}
        </Button>
        ) : null}
      </div>

      {insights?.weekly_revenue && insights.weekly_revenue.length > 0 ? (
        <div className="rounded-lg border bg-white p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t("web.provider.dashboard.insights.earningsTrend")}</h3>
          <div className="flex items-end gap-2 h-32" role="img" aria-label={t("web.provider.dashboard.insights.chartA11y")}>
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
{t("web.provider.dashboard.insights.upcoming")}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => router.push("/provider/calendar")}>
                {t("web.provider.dashboard.widgets.viewCalendar")}
              </Button>
            </div>
            <div className="space-y-2">
              {insights.upcoming_bookings.slice(0, 7).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="w-full text-start rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
                  onClick={() =>
                    router.push(
                      b.is_group_booking && b.group_booking_id
                        ? `/provider/group-bookings/${b.group_booking_id}`
                        : `/provider/bookings/${b.id}`,
                    )
                  }
                  aria-label={t("web.provider.dashboard.insights.upcomingBookingA11y", { name: b.customers?.full_name ?? t("web.provider.dashboard.insights.walkIn") })}
                >
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {b.customers?.full_name ?? t("web.provider.dashboard.insights.walkIn")}
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
{t("web.provider.dashboard.insights.noUpcoming")}
          </div>
        )}

        {insights?.top_services && insights.top_services.length > 0 ? (
          <div className="rounded-lg border bg-white p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{t("web.provider.dashboard.insights.topServices")}</h3>
            <p className="text-xs text-gray-500 mb-3">{t("web.provider.dashboard.insights.fixedWindow")}</p>
            <div className="space-y-3">
              {insights.top_services.map((svc, idx) => {
                const maxRev = insights.top_services[0]?.total_revenue || 1;
                const width = (svc.total_revenue / maxRev) * 100;
                return (
                  <div key={`${svc.service_name}-${idx}`}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-900 truncate pe-2">{svc.service_name}</span>
                      <span className="font-semibold shrink-0">
                        {formatCurrency(svc.total_revenue, tenantCurrency)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${width}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{t("web.provider.dashboard.insights.bookingsCount", { count: svc.booking_count })}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-gray-50 p-6 text-center text-sm text-gray-500">
{t("web.provider.dashboard.insights.noServiceData")}
          </div>
        )}
      </div>

      {insights?.recent_activity && insights.recent_activity.length > 0 ? (
        <div className="rounded-lg border bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Activity className="h-4 w-4 text-gray-500" />
{t("web.provider.dashboard.insights.recentActivity")}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => router.push("/provider/bookings")}>
              {t("web.provider.common.viewAll")}
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
                className="w-full text-start py-3 hover:bg-gray-50 transition-colors px-1"
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
            ? t("web.provider.dashboard.insights.truncatedBoth")
            : stats.bookings_truncated
              ? t("web.provider.dashboard.insights.truncatedBookings")
              : t("web.provider.dashboard.insights.truncatedLedger")}
        </p>
      )}

      {stats.metrics_time_basis ? (
        <p className="text-xs text-gray-400 px-1">{stats.metrics_time_basis}</p>
      ) : null}
    </div>
  );
}
