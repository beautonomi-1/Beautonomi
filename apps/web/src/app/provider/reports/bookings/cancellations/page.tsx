"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, XCircle, DollarSign, AlertTriangle, Info, CalendarDays } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../../utils/export";
import type { CancellationsReportResponse } from "@/app/api/provider/reports/bookings/cancellations/route";
import { CancellationsDailyChart, CancellationsReasonsChart } from "./components/CancellationsCharts";

export default function CancellationsReport() {
  const { t } = useTranslation();
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<CancellationsReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadReport();
  }, [dateRange, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);

      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      appendLocation(params);

      const response = await fetcher.get<{ data: CancellationsReportResponse }>(
        `/api/provider/reports/bookings/cancellations?${params.toString()}`
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

  const handleReset = () => {
    setDateRange({
      from: subDays(new Date(), 30),
      to: new Date(),
    });
  };

  const handleExportCsv = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "cancellations", exportCurrency);
    exportToCSV(exportData, "cancellations-report");
  };

  const handleExportPdf = () => {
    exportToPDF("cancellations-report", "cancellations-report", t("web.provider.reports.pages.bookings/cancellations.reportTitle"));
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.bookings/cancellations.title") },
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
          { label: t("web.provider.reports.pages.bookings/cancellations.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.bookings/cancellations.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.bookings/cancellations.title")} />
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
          { label: t("web.provider.reports.pages.bookings/cancellations.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.bookings/cancellations.unableToLoad")}
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
        { label: t("web.provider.reports.pages.bookings/cancellations.title") },
      ]}
      showCloseButton={false}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title={t("web.provider.reports.pages.bookings/cancellations.title")}
          subtitle={t("web.provider.reports.pages.bookings/cancellations.subtitle")}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportCsv} className="rounded-xl">
            <Download className="me-2 h-4 w-4" />
            {t("web.provider.common.csv")}
          </Button>
          <Button variant="outline" onClick={handleExportPdf} className="rounded-xl">
            {t("web.provider.reports.common.printPdf")}
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} onReset={handleReset} />

        <div id="cancellations-report" className="space-y-6">
          {data.basisNote ? (
            <div className="flex gap-3 rounded-xl border border-sky-200/90 bg-sky-50/95 px-4 py-3 text-sm leading-relaxed text-sky-950">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden />
              <div>
                <p className="font-medium text-sky-900">{t("web.provider.reports.common.factsAndDefinitions")}</p>
                <p className="mt-1">{data.basisNote}</p>
                {data.ledgerTransactionTypes?.length ? (
                  <p className="mt-2 text-xs text-sky-900/85">
                    {t("web.provider.reports.pages.bookings/cancellations.ledgerNetTypes", { types: data.ledgerTransactionTypes.join(", ") })}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.bookings/cancellations.cancelledScheduled")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{data.totalCancelled}</p>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                    <XCircle className="h-5 w-5 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.bookings/cancellations.cancellationRate")}</CardTitle>
                <p className="text-xs text-gray-500">{t("web.provider.reports.pages.bookings/cancellations.rateHint")}</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xl font-semibold tabular-nums tracking-tight text-orange-800">
                    {data.cancellationRate.toFixed(1)}%
                  </p>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.bookings/cancellations.ledgerNet")}</CardTitle>
                <p className="text-xs text-gray-500">{t("web.provider.reports.pages.bookings/cancellations.ledgerNetHint")}</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{fmt(data.lostRevenue)}</p>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                    <DollarSign className="h-5 w-5 text-rose-700" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.bookings/cancellations.appointmentsInWindow")}</CardTitle>
                <p className="text-xs text-gray-500">{t("web.provider.reports.pages.bookings/cancellations.denominator", { timezone: data.timezone ?? "" })}</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{data.totalBookings}</p>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                    <CalendarDays className="h-5 w-5 text-gray-700" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">{t("web.provider.reports.pages.bookings/cancellations.byDay")}</CardTitle>
                <p className="text-sm font-normal text-gray-500">
                  {t("web.provider.reports.pages.bookings/cancellations.byDayHint")}
                </p>
              </CardHeader>
              <CardContent>
                <CancellationsDailyChart rows={data.dailyBreakdown} />
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">{t("web.provider.reports.pages.bookings/cancellations.reasonMix")}</CardTitle>
                <p className="text-sm font-normal text-gray-500">{t("web.provider.reports.pages.bookings/cancellations.reasonMixHint")}</p>
              </CardHeader>
              <CardContent>
                <CancellationsReasonsChart rows={data.cancellationReasons} />
              </CardContent>
            </Card>
          </div>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.bookings/cancellations.allReasons")}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.cancellationReasons.length === 0 ? (
                <EmptyReportState title={t("web.provider.reports.pages.bookings/cancellations.noReasons")} description={t("web.provider.reports.pages.bookings/cancellations.noReasonsDesc")} />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/80">
                        <th className="px-4 py-3 text-start font-semibold text-gray-700">{t("web.provider.reports.pages.bookings/cancellations.reason")}</th>
                        <th className="px-4 py-3 text-end font-semibold text-gray-700">{t("web.provider.reports.pages.bookings/cancellations.count")}</th>
                        <th className="px-4 py-3 text-end font-semibold text-gray-700">{t("web.provider.reports.pages.bookings/cancellations.share")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cancellationReasons.map((reason) => (
                        <tr key={reason.reason} className="border-b border-gray-50 hover:bg-gray-50/60">
                          <td className="px-4 py-3 font-medium text-gray-900">{reason.reason}</td>
                          <td className="px-4 py-3 text-end tabular-nums text-gray-800">{reason.count}</td>
                          <td className="px-4 py-3 text-end tabular-nums text-gray-600">{reason.percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.bookings/cancellations.recent")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">{t("web.provider.reports.pages.bookings/cancellations.recentHint")}</p>
            </CardHeader>
            <CardContent>
              {data.recentCancellations.length === 0 ? (
                <EmptyReportState title={t("web.provider.reports.pages.bookings/cancellations.noCancellations")} description={t("web.provider.reports.pages.bookings/cancellations.noCancellationsDesc")} />
              ) : (
                <div className="space-y-3">
                  {data.recentCancellations.map((booking) => (
                    <div
                      key={String(booking.id)}
                      className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/40 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {(booking.users as { full_name?: string } | null)?.full_name ?? t("web.provider.reports.pages.bookings/cancellations.unknownClient")}
                        </p>
                        <p className="text-sm text-gray-600">
                          {booking.scheduled_at
                            ? format(new Date(String(booking.scheduled_at)), "MMM dd, yyyy 'at' h:mm a")
                            : t("web.provider.common.emDash")}
                        </p>
                        {booking.cancellation_reason ? (
                          <p className="mt-1 text-xs text-gray-500">{t("web.provider.reports.pages.bookings/cancellations.reasonLabel", { reason: String(booking.cancellation_reason) })}</p>
                        ) : null}
                      </div>
                      <div className="text-start sm:text-end">
                        <p className="font-semibold tabular-nums text-gray-900">
                          {fmt(Number(booking.total_amount ?? 0))}
                        </p>
                        <p className="text-xs text-gray-500">
                          {booking.cancelled_at || booking.scheduled_at
                            ? format(new Date(String(booking.cancelled_at || booking.scheduled_at)), "MMM dd, yyyy")
                            : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
