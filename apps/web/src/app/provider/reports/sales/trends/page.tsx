"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, TrendingDown, Wallet, Calendar, Info, ArrowRight, Layers } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { RevenueChart } from "../../components/RevenueChart";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface RevenueTrendsData {
  period: string;
  trends: Array<{
    period: string;
    revenue: number;
    bookings: number;
  }>;
  totalRevenue: number;
  totalBookings: number;
  averageRevenue: number;
  revenueGrowth: number;
  bookingsGrowth: number;
  priorBucketComparison?: {
    revenueChangePct: number;
    bookingsChangePct: number;
    previousPeriod: string;
    currentPeriod: string;
  };
  dateRange?: { fromYmd: string; toYmd: string; timezone: string };
  ledgerTransactionTypes?: string[];
  basisNote?: string;
  basis?: Record<string, string>;
  reportBasis?: string;
}

const PERIOD_HELP: Record<string, string> = {
  day: "Each point is a calendar day. Ledger uses recognition date; visits use appointment date.",
  week: "Each point is a week (week starts Monday).",
  month: "Each point is a calendar month.",
  year: "Each point is a calendar year.",
};

export default function RevenueTrendsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<RevenueTrendsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [period, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append("period", period);
      appendLocation(params);

      const response = await fetcher.get<{ data: RevenueTrendsData }>(
        `/api/provider/reports/sales/trends?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading revenue trends:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "revenue-trends", exportCurrency);
    exportToCSV(exportData, "revenue-trends-report");
  };

  const formatBucketLabel = (periodStr: string, gran: string | undefined) => {
    if (!gran) return periodStr;
    if (gran === "day") {
      const d = new Date(periodStr + (periodStr.length <= 10 ? "T12:00:00.000Z" : ""));
      return Number.isFinite(d.getTime())
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : periodStr;
    }
    if (gran === "week" && /^\d{4}-\d{2}-\d{2}$/.test(periodStr)) {
      return `Week of ${new Date(periodStr + "T12:00:00.000Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    if (gran === "month" && /^\d{4}-\d{2}$/.test(periodStr)) {
      const [y, m] = periodStr.split("-");
      const mi = parseInt(m, 10);
      if (!Number.isFinite(mi) || mi < 1 || mi > 12) return periodStr;
      return new Date(parseInt(y, 10), mi - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    if (gran === "year") return periodStr.length >= 4 ? periodStr.slice(0, 4) : periodStr;
    return periodStr;
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Revenue trends" },
        ]}
      >
        <ReportSkeleton />
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Revenue trends" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load revenue trends data"}
        />
      </SettingsDetailLayout>
    );
  }

  const rangeCaption = data.dateRange
    ? `${data.dateRange.fromYmd} → ${data.dateRange.toYmd} · ${data.dateRange.timezone.replace(/_/g, " ")}`
    : null;
  const prior = data.priorBucketComparison;

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Revenue trends" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="revenue-trends-report">
        <PageHeader
          title="Revenue trends"
          subtitle="Ledger net over time vs scheduled visits — facts from finance_transactions and bookings"
          actions={
            <Button variant="outline" className="min-h-[44px] touch-manipulation gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Bucket size</p>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[200px] border-gray-200 shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily (~31 days)</SelectItem>
                <SelectItem value="week">Weekly (~12 weeks)</SelectItem>
                <SelectItem value="month">Monthly (12 months)</SelectItem>
                <SelectItem value="year">Yearly (4 years)</SelectItem>
              </SelectContent>
            </Select>
            {rangeCaption ? <p className="text-xs text-gray-500">{rangeCaption}</p> : null}
            <p className="max-w-xl text-xs text-gray-600">{PERIOD_HELP[data.period] ?? ""}</p>
          </div>
        </div>

        {data.basisNote ? (
          <div className="flex gap-3 rounded-xl border border-indigo-200/90 bg-indigo-50/95 px-4 py-3 text-sm leading-relaxed text-indigo-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" aria-hidden />
            <div>
              <p className="font-medium text-indigo-900">How to read this report</p>
              <p className="mt-1">{data.basisNote}</p>
              {data.reportBasis ? (
                <p className="mt-2 text-xs font-medium text-indigo-900/95">{data.reportBasis}</p>
              ) : null}
              {data.ledgerTransactionTypes?.length ? (
                <p className="mt-2 text-xs text-indigo-900/90">
                  Ledger types included: {data.ledgerTransactionTypes.join(", ")}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {data.basis && Object.keys(data.basis).length > 0 ? (
          <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50/90 px-4 py-4 sm:grid-cols-2">
            {Object.entries(data.basis).map(([key, text]) => (
              <div key={key}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {key === "ledger"
                    ? "Ledger buckets"
                    : key === "visits"
                      ? "Visit counts"
                      : key === "retail"
                        ? "Retail / products"
                        : key === "growth"
                          ? "Growth %"
                          : key === "averageRevenue"
                            ? "Average shown"
                            : key}
                </p>
                <p className="mt-1 text-sm leading-snug text-gray-800">{text}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Ledger net (window)</CardTitle>
              <p className="text-xs text-gray-500">Sum of buckets — platform economics</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
                  {fmt(data.totalRevenue)}
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                  <Wallet className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Scheduled visits</CardTitle>
              <p className="text-xs text-gray-500">Excl. cancelled & no-show</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{data.totalBookings}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50">
                  <Calendar className="h-5 w-5 text-teal-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg ledger / bucket</CardTitle>
              <p className="text-xs text-gray-500">Not per visit</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{fmt(data.averageRevenue)}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <Layers className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Change vs prior bucket</CardTitle>
              <p className="text-xs text-gray-500">Last vs previous period only</p>
            </CardHeader>
            <CardContent>
              {prior ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-[11px] leading-tight text-gray-600">
                    <span className="truncate">{formatBucketLabel(prior.previousPeriod, data.period)}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-gray-400" />
                    <span className="truncate">{formatBucketLabel(prior.currentPeriod, data.period)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {data.revenueGrowth >= 0 ? (
                      <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600" />
                    ) : (
                      <TrendingDown className="h-5 w-5 shrink-0 text-red-600" />
                    )}
                    <p
                      className={`text-2xl font-semibold tabular-nums ${data.revenueGrowth >= 0 ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {data.revenueGrowth >= 0 ? "+" : ""}
                      {data.revenueGrowth.toFixed(1)}%
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    Visits: {data.bookingsGrowth >= 0 ? "+" : ""}
                    {data.bookingsGrowth.toFixed(1)}%
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Need at least two buckets to compare.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Ledger net & visits</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              Purple / violet = ledger net (left axis). Teal = scheduled visits (right axis). Scales are independent.
            </p>
          </CardHeader>
          <CardContent>
            {data.trends.length === 0 ? (
              <EmptyReportState title="No data" description="No ledger or booking activity in this window." />
            ) : (
              <RevenueChart
                data={data.trends.map((t) => ({
                  date: t.period,
                  revenue: t.revenue,
                  bookings: t.bookings,
                }))}
                type="line"
                period={data.period}
                showBookingsSeries
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Bucket breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {data.trends.length === 0 ? (
              <EmptyReportState title="No rows" description="No trend rows." />
            ) : (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
                {data.trends.map((trend) => (
                  <div
                    key={trend.period}
                    className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 transition-colors hover:bg-gray-50/80"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{formatBucketLabel(trend.period, data.period)}</p>
                      <p className="text-sm tabular-nums text-gray-600">
                        {trend.bookings} visit{trend.bookings !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">{fmt(trend.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
