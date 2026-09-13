"use client";

import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportExportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect, useCallback } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Users, TrendingUp, Repeat, Info, CalendarRange } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../../utils/export";
import type { ClientRetentionResponse } from "@/app/api/provider/reports/clients/retention/route";
import { ClientRetentionTrendChart, ClientRetentionVolumeChart } from "./components/ClientRetentionCharts";
import { getDefaultMoneyLocale } from "@beautonomi/utils";

export default function ClientRetentionReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const exportCurrency = useReportExportCurrency();
  const { t } = useTranslation();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<ClientRetentionResponse | null>(null);
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

      const response = await fetcher.get<{ data: ClientRetentionResponse }>(
        `/api/provider/reports/clients/retention?${params.toString()}`
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

  const handleExportCsv = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "client-retention", exportCurrency);
    exportToCSV(exportData, "client-retention-report");
  };

  const handleExportPdf = () => {
    exportToPDF("client-retention-report", "client-retention-report", t("web.provider.reports.pages.clients/retention.pdfTitle"));
  };

  const formatPeriodLabel = useCallback(
    (periodStr: string) => {
      if (period === "month") {
        const [year, month] = periodStr.split("-");
        if (!year || !month) return periodStr;
        return new Date(parseInt(year, 10), parseInt(month, 10) - 1).toLocaleDateString(getDefaultMoneyLocale(), {
          month: "long",
          year: "numeric",
        });
      }
      if (period === "quarter") {
        const m = periodStr.match(/^(\d{4})-Q(\d)$/);
        if (m) return t("web.provider.reports.pages.clients/retention.quarterLabel", { q: m[2], year: m[1] });
        return periodStr.replace("-", " ");
      }
      return periodStr;
    },
    [period, t],
  );

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.clients/retention.title") },
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
          { label: t("web.provider.reports.pages.clients/retention.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.clients/retention.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.clients/retention.title")} />
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
          { label: t("web.provider.reports.pages.clients/retention.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.clients/retention.unableToLoad")}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.clients/retention.title") },
      ]}
      showCloseButton={false}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title={t("web.provider.reports.pages.clients/retention.title")}
          subtitle={t("web.provider.reports.pages.clients/retention.subtitle")}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportCsv} className="gap-2 rounded-xl">
            <Download className="h-4 w-4" />
            {t("web.provider.common.csv")}
          </Button>
          <Button variant="outline" onClick={handleExportPdf} className="gap-2 rounded-xl">
            {t("web.provider.common.pdf")}
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-6" id="client-retention-report">
        <div className="flex flex-wrap items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[200px] rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">{t("web.provider.reports.pages.clients/retention.monthlyBuckets")}</SelectItem>
              <SelectItem value="quarter">{t("web.provider.reports.pages.clients/retention.quarterlyBuckets")}</SelectItem>
              <SelectItem value="year">{t("web.provider.reports.pages.clients/retention.yearlyBuckets")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarRange className="h-4 w-4 shrink-0 text-gray-500" />
            <span>
              {t("web.provider.reports.pages.clients/retention.windowLookback", { from: data.analysisFromYmd, to: data.analysisToYmd, months: data.monthsOfHistory, tz: data.timezone })}
            </span>
          </div>
        </div>

        {data.basisNote ? (
          <div className="flex gap-3 rounded-xl border border-sky-200/90 bg-sky-50/95 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden />
            <div>
              <p className="font-medium text-sky-900">{t("web.provider.reports.common.factsAndDefinitions")}</p>
              <p className="mt-1">{data.basisNote}</p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.business/overview.distinctClients")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.clients/retention.withCompletedVisit")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{data.totalClients}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/retention.singleVisitClients")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.clients/retention.exactlyOneVisit")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-amber-900">{data.newClients}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <Users className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/retention.repeatClients")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.clients/retention.twoOrMoreVisits")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-emerald-900">{data.returningClients}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                  <Repeat className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/retention.repeatShare")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.clients/retention.repeatDivDistinct")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-rose-900">
                  {data.overallRetentionRate.toFixed(1)}%
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                  <TrendingUp className="h-5 w-5 text-rose-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/retention.avgCompletedVisits")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.averageVisitsPerClient.toFixed(2)}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.clients/retention.periodOverPeriod")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                {t("web.provider.reports.pages.clients/retention.periodOverPeriodHint")}
              </p>
            </CardHeader>
            <CardContent>
              <ClientRetentionTrendChart rows={data.retentionByPeriod} formatPeriodLabel={formatPeriodLabel} />
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.clients/retention.priorVsCarryOver")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                {t("web.provider.reports.pages.clients/retention.priorVsCarryOverHint")}
              </p>
            </CardHeader>
            <CardContent>
              <ClientRetentionVolumeChart rows={data.retentionByPeriod} formatPeriodLabel={formatPeriodLabel} />
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t("web.provider.reports.pages.clients/retention.periodDetail")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.retentionByPeriod.length === 0 ? (
              <EmptyReportState
                title={t("web.provider.reports.pages.clients/retention.noChainedPeriods")}
                description={t("web.provider.reports.pages.clients/retention.noChainedPeriodsHint")}
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80">
                      <th className="px-4 py-3 text-start font-semibold text-gray-700">{t("web.provider.reports.pages.clients/retention.period")}</th>
                      <th className="px-4 py-3 text-end font-semibold text-gray-700">{t("web.provider.reports.pages.clients/retention.priorBucket")}</th>
                      <th className="px-4 py-3 text-end font-semibold text-gray-700">{t("web.provider.reports.pages.clients/retention.returned")}</th>
                      <th className="px-4 py-3 text-end font-semibold text-gray-700">{t("web.provider.reports.pages.clients/retention.retention")}</th>
                      <th className="px-4 py-3 text-end font-semibold text-gray-700">{t("web.provider.reports.pages.clients/retention.clientsBucket")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.retentionByPeriod.map((item) => (
                      <tr key={item.period} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-3 font-medium text-gray-900">{formatPeriodLabel(item.period)}</td>
                        <td className="px-4 py-3 text-end tabular-nums text-gray-700">{item.clientsInPriorPeriod}</td>
                        <td className="px-4 py-3 text-end tabular-nums text-gray-700">{item.returnedFromPriorPeriod}</td>
                        <td className="px-4 py-3 text-end font-medium tabular-nums text-rose-800">
                          {item.retentionRate.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums text-gray-800">{item.clients}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
