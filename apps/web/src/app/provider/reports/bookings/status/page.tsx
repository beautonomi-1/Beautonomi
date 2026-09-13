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
import { Download, CheckCircle2, XCircle, AlertCircle, Calendar, Info } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../../utils/export";
import { BookingStatusPieChart } from "../components/BookingStatusPieChart";

interface BookingStatusData {
  statusBreakdown: Record<string, number>;
  totalBookings: number;
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
  bookingsByStatus: Array<{
    status: string;
    count: number;
    percentage: number;
    revenue: number;
  }>;
  ledgerTransactionTypes?: string[];
  basisNote?: string;
}

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function statusStyle(status: string): { bar: string; dot: string } {
  switch (status) {
    case "completed":
      return { bar: "bg-emerald-500", dot: "bg-emerald-500" };
    case "confirmed":
      return { bar: "bg-blue-500", dot: "bg-blue-500" };
    case "pending":
    case "pending_payment":
      return { bar: "bg-amber-400", dot: "bg-amber-400" };
    case "cancelled":
      return { bar: "bg-red-500", dot: "bg-red-500" };
    case "no_show":
      return { bar: "bg-gray-500", dot: "bg-gray-500" };
    case "in_progress":
    case "waiting":
    case "checked_in":
      return { bar: "bg-violet-500", dot: "bg-violet-500" };
    default:
      return { bar: "bg-slate-400", dot: "bg-slate-400" };
  }
}

export default function BookingStatusReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<BookingStatusData | null>(null);
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

      const response = await fetcher.get<{ data: BookingStatusData }>(
        `/api/provider/reports/bookings/status?${params.toString()}`
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

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.bookings/status.title") },
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
          { label: t("web.provider.reports.pages.bookings/status.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.bookings/status.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.bookings/status.title")} />
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
          { label: t("web.provider.reports.pages.bookings/status.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.bookings/status.unableToLoad")}
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
        { label: t("web.provider.reports.pages.bookings/status.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="booking-status-report">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title={t("web.provider.reports.pages.bookings/status.title")}
            subtitle={t("web.provider.reports.pages.bookings/status.subtitle")}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!data) return;
                const exportData = formatReportDataForExport(data as unknown as ReportRow, "booking-status", exportCurrency);
                exportToCSV(exportData, "booking-status-report");
              }}
              className="min-h-[44px] touch-manipulation gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{t("web.provider.common.exportCsv")}</span>
              <span className="sm:hidden">{t("web.provider.common.csv")}</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!data) return;
                exportToPDF("booking-status-report", "booking-status-report", t("web.provider.reports.pages.bookings/status.pdfTitle"));
              }}
              className="min-h-[44px] touch-manipulation gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{t("web.provider.common.exportPdf")}</span>
              <span className="sm:hidden">{t("web.provider.common.pdf")}</span>
            </Button>
          </div>
        </div>

        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} onReset={handleReset} />

        {data.basisNote ? (
          <div className="flex gap-3 rounded-xl border border-sky-200/90 bg-sky-50/95 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden />
            <div>
              <p className="font-medium text-sky-900">{t("web.provider.reports.common.factsAndDefinitions")}</p>
              <p className="mt-1">{data.basisNote}</p>
              {data.ledgerTransactionTypes?.length ? (
                <p className="mt-2 text-xs text-sky-900/85">
{t("web.provider.reports.pages.bookings/status.ledgerNetIncludes", { types: data.ledgerTransactionTypes.join(", ") })}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.bookings/status.appointmentsInWindow")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.bookings/status.byScheduledDate")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{data.totalBookings}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                  <Calendar className="h-5 w-5 text-slate-700" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.common.status.completed")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.bookings/status.shareOfAppointments")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-emerald-700">{data.completionRate.toFixed(1)}%</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.common.status.cancelled")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.bookings/status.shareOfAppointments")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-red-700">{data.cancellationRate.toFixed(1)}%</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.bookings/status.noShow")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.bookings/status.shareOfAppointments")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-800">{data.noShowRate.toFixed(1)}%</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                  <AlertCircle className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.bookings/status.mixByStatus")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">{t("web.provider.reports.pages.bookings/status.shareOfScheduled")}</p>
            </CardHeader>
            <CardContent>
              {data.totalBookings > 0 ? (
                <BookingStatusPieChart rows={data.bookingsByStatus} />
              ) : (
                <p className="py-8 text-center text-sm text-gray-500">{t("web.provider.reports.pages.bookings/status.noAppointmentsInRange")}</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.bookings/status.ledgerNetByStatus")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                {t("web.provider.reports.pages.bookings/status.ledgerNetByStatusHint")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.bookingsByStatus.map((item) => {
                const styles = statusStyle(item.status);
                const pct = Math.min(100, Math.max(0, item.percentage));
                return (
                  <div key={item.status}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 font-medium text-gray-900">
                        <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
                        {formatStatusLabel(item.status)}
                      </span>
                      <span className="tabular-nums text-gray-700">
                        {fmt(item.revenue)}{" "}
                        <span className="text-xs text-gray-400">
{t("web.provider.reports.pages.bookings/status.countShare", { count: item.count, pct: pct.toFixed(1) })}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-full rounded-full transition-all ${styles.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t("web.provider.reports.pages.bookings/status.detailTable")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.bookingsByStatus.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-600">{t("web.provider.reports.pages.bookings/status.noBookingData")}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80">
                      <th className="px-4 py-3 text-start font-semibold text-gray-700">{t("web.provider.common.statusLabel")}</th>
                      <th className="px-4 py-3 text-end font-semibold text-gray-700">{t("web.provider.reports.pages.bookings/status.count")}</th>
                      <th className="px-4 py-3 text-end font-semibold text-gray-700">{t("web.provider.reports.pages.bookings/status.share")}</th>
                      <th className="px-4 py-3 text-end font-semibold text-gray-700">{t("web.provider.reports.pages.staff/performance.ledgerNet")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bookingsByStatus.map((item) => (
                      <tr key={item.status} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-3 font-medium text-gray-900">{formatStatusLabel(item.status)}</td>
                        <td className="px-4 py-3 text-end tabular-nums text-gray-800">{item.count}</td>
                        <td className="px-4 py-3 text-end tabular-nums text-gray-600">{item.percentage.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-end font-medium tabular-nums text-gray-900">{fmt(item.revenue)}</td>
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
