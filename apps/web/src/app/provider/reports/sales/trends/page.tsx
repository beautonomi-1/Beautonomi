"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, TrendingDown, Wallet, Calendar, Info, ArrowRight, Layers } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { RevenueChart } from "../../components/RevenueChart";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";
import { getDefaultMoneyLocale } from "@beautonomi/utils";

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

function periodHelp(t: (k: string) => string): Record<string, string> {
  return {
    day: t("web.provider.reports.pages.sales/trends.helpDay"),
    week: t("web.provider.reports.pages.sales/trends.helpWeek"),
    month: t("web.provider.reports.pages.sales/trends.helpMonth"),
    year: t("web.provider.reports.pages.sales/trends.helpYear"),
  };
}

export default function RevenueTrendsReport() {
  const { t } = useTranslation();
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<RevenueTrendsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadReport();
  }, [period, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);

      const params = new URLSearchParams();
      params.append("period", period);
      appendLocation(params);

      const response = await fetcher.get<{ data: RevenueTrendsData }>(
        `/api/provider/reports/sales/trends?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      const parsed = parseReportLoadError(err);
      if (parsed.subscriptionRequired) {
        setIsSubscriptionRequired(true);
        setError(null);
      } else {
        setError(parsed.message);
        setIsSubscriptionRequired(false);
      }
      console.error("Error loading report:", err);
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
        ? d.toLocaleDateString(getDefaultMoneyLocale(), { month: "short", day: "numeric", year: "numeric" })
        : periodStr;
    }
    if (gran === "week" && /^\d{4}-\d{2}-\d{2}$/.test(periodStr)) {
      return t("web.provider.reports.pages.sales/trends.weekOf", { date: new Date(periodStr + "T12:00:00.000Z").toLocaleDateString(getDefaultMoneyLocale(), { month: "short", day: "numeric", year: "numeric" }) });
    }
    if (gran === "month" && /^\d{4}-\d{2}$/.test(periodStr)) {
      const [y, m] = periodStr.split("-");
      const mi = parseInt(m, 10);
      if (!Number.isFinite(mi) || mi < 1 || mi > 12) return periodStr;
      return new Date(parseInt(y, 10), mi - 1).toLocaleDateString(getDefaultMoneyLocale(), { month: "long", year: "numeric" });
    }
    if (gran === "year") return periodStr.length >= 4 ? periodStr.slice(0, 4) : periodStr;
    return periodStr;
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.sales/trends.title") },
        ]}
      >
        <ReportSkeleton />
      </SettingsDetailLayout>
    );
  }

  if (isSubscriptionRequired) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.sales/trends.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.sales/trends.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.sales/trends.title")} />
        </div>
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.sales/trends.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.sales/trends.unableToLoad")}
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
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.sales/trends.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="revenue-trends-report">
        <PageHeader
          title={t("web.provider.reports.pages.sales/trends.title")}
          subtitle={t("web.provider.reports.pages.sales/trends.subtitle")}
          actions={
            <Button variant="outline" className="min-h-[44px] touch-manipulation gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              {t("web.provider.common.exportCsv")}
            </Button>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("web.provider.reports.pages.sales/trends.bucketSize")}</p>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[200px] border-gray-200 shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t("web.provider.reports.pages.sales/trends.daily")}</SelectItem>
                <SelectItem value="week">{t("web.provider.reports.pages.sales/trends.weekly")}</SelectItem>
                <SelectItem value="month">{t("web.provider.reports.pages.sales/trends.monthly")}</SelectItem>
                <SelectItem value="year">{t("web.provider.reports.pages.sales/trends.yearly")}</SelectItem>
              </SelectContent>
            </Select>
            {rangeCaption ? <p className="text-xs text-gray-500">{rangeCaption}</p> : null}
            <p className="max-w-xl text-xs text-gray-600">{periodHelp(t)[data.period] ?? ""}</p>
          </div>
        </div>

        {data.basisNote ? (
          <div className="flex gap-3 rounded-xl border border-indigo-200/90 bg-indigo-50/95 px-4 py-3 text-sm leading-relaxed text-indigo-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" aria-hidden />
            <div>
              <p className="font-medium text-indigo-900">{t("web.provider.reports.pages.sales/trends.howToRead")}</p>
              <p className="mt-1">{data.basisNote}</p>
              {data.reportBasis ? (
                <p className="mt-2 text-xs font-medium text-indigo-900/95">{data.reportBasis}</p>
              ) : null}
              {data.ledgerTransactionTypes?.length ? (
                <p className="mt-2 text-xs text-indigo-900/90">
                  {t("web.provider.reports.pages.sales/trends.ledgerTypes", { types: data.ledgerTransactionTypes.join(", ") })}
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
                    ? t("web.provider.reports.pages.sales/trends.ledgerBuckets")
                    : key === "visits"
                      ? t("web.provider.reports.pages.sales/trends.visitCounts")
                      : key === "retail"
                        ? t("web.provider.reports.pages.sales/trends.retailProducts")
                        : key === "growth"
                          ? t("web.provider.reports.pages.sales/trends.growthPct")
                          : key === "averageRevenue"
                            ? t("web.provider.reports.pages.sales/trends.averageShown")
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
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/trends.ledgerNetWindow")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/trends.ledgerNetHint")}</p>
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
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/trends.scheduledVisits")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/trends.scheduledHint")}</p>
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
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/trends.avgLedger")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/trends.avgHint")}</p>
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
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/trends.changePrior")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/trends.changeHint")}</p>
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
                    {t("web.provider.reports.pages.sales/trends.visitsChange", { sign: data.bookingsGrowth >= 0 ? "+" : "", pct: data.bookingsGrowth.toFixed(1) })}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">{t("web.provider.reports.pages.sales/trends.needTwoBuckets")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t("web.provider.reports.pages.sales/trends.ledgerAndVisits")}</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              {t("web.provider.reports.pages.sales/trends.chartHint")}
            </p>
          </CardHeader>
          <CardContent>
            {data.trends.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.sales/trends.noData")} description={t("web.provider.reports.pages.sales/trends.noDataDesc")} />
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
            <CardTitle className="text-lg">{t("web.provider.reports.pages.sales/trends.bucketBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.trends.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.sales/trends.noRows")} description={t("web.provider.reports.pages.sales/trends.noRowsDesc")} />
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
                        {t("web.provider.reports.pages.sales/trends.visits", { count: trend.bookings })}
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
