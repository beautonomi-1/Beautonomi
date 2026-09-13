"use client";

import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";

import React, { useState, useEffect } from "react";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, TrendingDown, Info } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface PeriodSlice {
  revenue: number;
  ledgerFromBookings?: number;
  ledgerFromProductOrders?: number;
  bookings: number;
  completed: number;
  clients: number;
  averageLedgerPerScheduledBooking: number;
  averageValue?: number;
}

interface BusinessComparisonData {
  timezone?: string;
  period: string;
  reportBasis?: string;
  basis?: Record<string, string>;
  windows?: {
    current?: { fromYmd?: string; toYmd?: string; description?: string };
    previous?: { fromYmd?: string; toYmd?: string; description?: string };
  };
  current: PeriodSlice;
  previous: PeriodSlice;
  growth: {
    revenue: number;
    bookings: number;
    clients: number;
    averageLedgerPerScheduledBooking: number;
  };
}

const PERIOD_OPTION_VALUES = ["month", "quarter", "year"] as const;
const PERIOD_OPTION_KEYS = {
  month: "monthVsPrior",
  quarter: "quarterVsPrior",
  year: "yearVsPrior",
} as const;
const BASIS_LABEL_KEYS: Record<string, string> = {
  currentWindow: "currentColumn",
  previousWindow: "previousColumn",
  ledgerHeadline: "ledgerHeadline",
  averagePerBooking: "avgPerBooking",
  bookings: "bookingCounts",
  growth: "growthPct",
};

function GrowthRow({
  value,
  suffix = "%",
  isNew = false,
}: {
  value: number;
  suffix?: string;
  isNew?: boolean;
}) {
  const { t } = useTranslation();
  if (isNew) {
    return (
      <div className="flex items-center gap-2 border-t pt-3">
        <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600" />
        <p className="text-lg font-semibold text-emerald-700">{t("web.provider.reports.pages.business/comparison.new")}</p>
        <span className="text-xs text-gray-500">{t("web.provider.reports.pages.business/comparison.vsPreviousColumn")}</span>
      </div>
    );
  }
  if (value === 0) {
    return (
      <div className="flex items-center gap-2 border-t pt-3">
        <span className="h-5 w-5 shrink-0 text-center text-gray-500">{t("web.provider.common.emDash")}</span>
        <p className="text-lg font-semibold tabular-nums text-gray-600">0{suffix}</p>
        <span className="text-xs text-gray-500">{t("web.provider.reports.pages.business/comparison.vsPreviousColumn")}</span>
      </div>
    );
  }
  const up = value > 0;
  return (
    <div className="flex items-center gap-2 border-t pt-3">
      {up ? <TrendingUp className="h-5 w-5 shrink-0 text-green-600" /> : <TrendingDown className="h-5 w-5 shrink-0 text-red-600" />}
      <p className={`text-lg font-semibold tabular-nums ${up ? "text-green-700" : "text-red-600"}`}>
        {up ? "+" : ""}
        {value.toFixed(1)}
        {suffix}
      </p>
      <span className="text-xs text-gray-500">{t("web.provider.reports.pages.business/comparison.vsPreviousColumn")}</span>
    </div>
  );
}

function LedgerSplitHint({
  lb,
  lo,
  fmt,
}: {
  lb: number;
  lo: number;
  fmt: (n: number) => string;
}) {
  const { t } = useTranslation();
  if ((lb ?? 0) <= 0 || (lo ?? 0) <= 0) return null;
  return (
    <p className="mt-2 text-xs leading-snug text-emerald-900/85">
      {t("web.provider.reports.pages.business/comparison.bookingsLedgerSplit", { bookings: fmt(lb), orders: fmt(lo) })}
    </p>
  );
}

export default function BusinessComparisonReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const { t } = useTranslation();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<BusinessComparisonData | null>(null);
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

      const response = await fetcher.get<{ data: BusinessComparisonData }>(
        `/api/provider/reports/business/comparison?${params.toString()}`,
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
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "business-comparison", exportCurrency);
    exportToCSV(exportData, "business-comparison-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.business/comparison.title") },
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
          { label: t("web.provider.reports.pages.business/comparison.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.business/comparison.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.business/comparison.title")} />
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
          { label: t("web.provider.reports.pages.business/comparison.title") },
        ]}
      >
        <EmptyReportState title={t("web.provider.common.failedToLoadReport")} description={error || t("web.provider.reports.pages.business/comparison.unableToLoad")} />
      </SettingsDetailLayout>
    );
  }

  const basisText = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  const wc = data.windows?.current;
  const wp = data.windows?.previous;

  const curAvg =
    data.current.averageLedgerPerScheduledBooking ?? data.current.averageValue ?? 0;
  const prevAvg =
    data.previous.averageLedgerPerScheduledBooking ?? data.previous.averageValue ?? 0;
  const avgGrowth =
    data.growth.averageLedgerPerScheduledBooking ??
    (prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : 0);

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.business/comparison.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.business/comparison.titleSentence")}
          subtitle={t("web.provider.reports.pages.business/comparison.subtitle")}
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="me-2 h-4 w-4" />
              {t("web.provider.dataTableShell.export")}
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTION_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`web.provider.reports.pages.business/comparison.${PERIOD_OPTION_KEYS[value]}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data.timezone ? <p className="text-sm text-gray-600">{t("web.provider.reports.common.timezoneDot", { tz: data.timezone })}</p> : null}
        </div>

        {wc?.fromYmd && wc?.toYmd ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50/90 px-4 py-3 text-sm">
            <p>
              <span className="font-medium text-gray-800">{t("web.provider.reports.pages.business/comparison.currentRange")}</span> {wc.fromYmd} → {wc.toYmd}
              {wc.description ? <span className="text-gray-600"> · {wc.description}</span> : null}
            </p>
            {wp?.fromYmd && wp?.toYmd ? (
              <p className="mt-1">
                <span className="font-medium text-gray-800">{t("web.provider.reports.pages.business/comparison.previousRange")}</span> {wp.fromYmd} → {wp.toYmd}
                {wp.description ? <span className="text-gray-600"> · {wp.description}</span> : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {basisText ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/95 px-4 py-3 text-sm text-sky-950">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">{t("web.provider.reports.pages.business/comparison.whatThisCompares")}</p>
                <p className="mt-2 leading-relaxed">{basisText}</p>
              </div>
            </div>
          </div>
        ) : null}

        {basisEntries.length > 0 ? (
          <div className="rounded-xl border border-violet-100 bg-violet-50/90 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-900">{t("web.provider.reports.common.definitions")}</p>
            <ul className="mt-2 space-y-2 text-sm text-violet-950">
              {basisEntries.map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium">{t(`web.provider.reports.pages.business/comparison.${BASIS_LABEL_KEYS[k] ?? k}`, { defaultValue: k })} · </span>
                  {v}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-emerald-100 bg-emerald-50/35">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.business/overview.ledgerEarnings")}</CardTitle>
              <p className="text-sm font-normal text-emerald-900/85">{t("web.provider.reports.pages.business/comparison.providerEarningsHint")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-emerald-900/90">{t("web.provider.reports.common.current")}</p>
                <p className="text-2xl font-semibold tabular-nums text-emerald-950">{fmt(data.current.revenue)}</p>
                <LedgerSplitHint
                  lb={data.current.ledgerFromBookings ?? 0}
                  lo={data.current.ledgerFromProductOrders ?? 0}
                  fmt={fmt}
                />
              </div>
              <div>
                <p className="mb-1 text-sm text-emerald-900/90">{t("web.provider.reports.common.previous")}</p>
                <p className="text-xl font-medium tabular-nums text-emerald-900">{fmt(data.previous.revenue)}</p>
                <LedgerSplitHint
                  lb={data.previous.ledgerFromBookings ?? 0}
                  lo={data.previous.ledgerFromProductOrders ?? 0}
                  fmt={fmt}
                />
              </div>
              <GrowthRow value={data.growth.revenue} />
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.business/overview.scheduledBookings")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">{t("web.provider.reports.pages.business/comparison.excludesCancelled")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-gray-600">{t("web.provider.reports.common.current")}</p>
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.current.bookings}</p>
                <p className="mt-1 text-xs text-gray-500">{t("web.provider.reports.pages.business/overview.completedCount", { count: data.current.completed })}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-gray-600">{t("web.provider.reports.common.previous")}</p>
                <p className="text-xl font-medium tabular-nums text-gray-700">{data.previous.bookings}</p>
                <p className="mt-1 text-xs text-gray-500">{t("web.provider.reports.pages.business/overview.completedCount", { count: data.previous.completed })}</p>
              </div>
              <GrowthRow value={data.growth.bookings} />
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.business/overview.distinctClients")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">{t("web.provider.reports.pages.business/comparison.uniqueCustomerHint")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-gray-600">{t("web.provider.reports.common.current")}</p>
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.current.clients}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-gray-600">{t("web.provider.reports.common.previous")}</p>
                <p className="text-xl font-medium tabular-nums text-gray-700">{data.previous.clients}</p>
              </div>
              <GrowthRow value={data.growth.clients} />
            </CardContent>
          </Card>

          <Card className="border-indigo-100 bg-indigo-50/40">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.business/comparison.avgLedgerPerBooking")}</CardTitle>
              <p className="text-sm font-normal text-indigo-900/85">
                  {t("web.provider.reports.pages.business/comparison.avgLedgerHint")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-indigo-900/90">{t("web.provider.reports.common.current")}</p>
                <p className="text-2xl font-semibold tabular-nums text-indigo-950">{fmt(curAvg)}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-indigo-900/90">{t("web.provider.reports.common.previous")}</p>
                <p className="text-xl font-medium tabular-nums text-indigo-900">{fmt(prevAvg)}</p>
              </div>
              <GrowthRow value={avgGrowth} />
            </CardContent>
          </Card>
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
