"use client";
import { useTranslation } from "@beautonomi/i18n";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown, Info } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { RevenueChart } from "../../components/RevenueChart";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface SalesSummaryData {
  totalRevenue: number;
  /** Net from appointment-linked ledger rows (before retail add-on). */
  appointmentLedgerRevenue?: number;
  /** Product / walk-in orders via ledger. */
  retailLedgerRevenue?: number;
  retailOrderCount?: number;
  totalBookings: number;
  /** Bookings with any appointment ledger net > 0 in range. */
  bookingsWithLedgerActivity?: number;
  averageBookingValue: number;
  revenueGrowth: number;
  bookingsGrowth: number;
  revenueByDay: Array<{ date: string; revenue: number; bookings: number }>;
  revenueByService: Array<{ serviceName: string; revenue: number; bookings: number }>;
  revenueByStaff: Array<{ staffName: string; revenue: number; bookings: number }>;
  basisNote?: string;
  recordedTakings?: {
    total: number;
    byPaymentMethod: Record<string, number>;
    bookingPaymentsTotal: number;
    walletTotal: number;
    retailAndLegacySalesTotal: number;
    tipsTotal: number;
    cancellationFeesTotal: number;
    bookingCount: number;
    salesCount: number;
  };
  recordedTakingsBasisNote?: string;
}

export default function SalesSummaryReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { t } = useTranslation();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<SalesSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);
  const [subscriptionGateMessage, setSubscriptionGateMessage] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [dateRange, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      appendLocation(params);

      const response = await fetcher.get<{ data: SalesSummaryData }>(
        `/api/provider/reports/sales/summary?${params.toString()}`,
        { timeoutMs: 120_000 },
      );
      setData(response.data);
    } catch (err) {
      const parsed = parseReportLoadError(err);
      if (parsed.subscriptionRequired) {
        setIsSubscriptionRequired(true);
        setSubscriptionGateMessage(parsed.message);
        setError(null);
      } else {
        setError(parsed.message);
        setIsSubscriptionRequired(false);
        setSubscriptionGateMessage(null);
      }
      console.error("Error loading sales summary:", err);
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

  const handleExport = (format: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (format === "csv") {
      const exportData = formatReportDataForExport(data as unknown as ReportRow, "sales-summary", exportCurrency);
      exportToCSV(exportData, "sales-summary-report");
    } else {
      exportToPDF("sales-summary-report", "sales-summary-report", t("web.provider.reports.pages.sales/summary.reportTitle"));
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.sales/summary.title") },
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
          { label: t("web.provider.reports.pages.sales/summary.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title={t("web.provider.reports.pages.sales/summary.title")}
            subtitle={t("web.provider.reports.pages.sales/summary.subtitleGate")}
          />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.sales/summary.feature")} message={subscriptionGateMessage} />
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
          { label: t("web.provider.reports.pages.sales/summary.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.sales/summary.unableToLoad")}
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
        { label: t("web.provider.reports.pages.sales/summary.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="sales-summary-report">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title={t("web.provider.reports.pages.sales/summary.title")}
            subtitle={t("web.provider.reports.pages.sales/summary.subtitle")}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t("web.provider.common.exportCsv")}</span>
              <span className="sm:hidden">{t("web.provider.common.csv")}</span>
            </Button>
            <Button variant="outline" onClick={() => handleExport("pdf")} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t("web.provider.common.exportPdf")}</span>
              <span className="sm:hidden">{t("web.provider.common.pdf")}</span>
            </Button>
          </div>
        </div>

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        {data.basisNote ? (
          <div className="flex gap-3 rounded-xl border border-sky-200/80 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden />
            <p>{data.basisNote}</p>
          </div>
        ) : null}

        {data.recordedTakingsBasisNote ? (
          <div className="flex gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm leading-relaxed text-emerald-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
            <p>{data.recordedTakingsBasisNote}</p>
          </div>
        ) : null}

        {/* Key metrics — ledger vs schedule */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.sales/summary.totalRecognizedRevenue")}
              </CardTitle>
              <p className="text-xs text-gray-500">
                {t("web.provider.reports.pages.sales/summary.totalRecognizedHint")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <p className="text-3xl font-semibold tracking-tight text-gray-900">
                  {fmt(data.totalRevenue)}
                </p>
                <div className="flex items-center gap-1 text-sm font-medium">
                  {data.revenueGrowth >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  <span className={data.revenueGrowth >= 0 ? "text-green-700" : "text-red-700"}>
                    {Math.abs(data.revenueGrowth).toFixed(1)}%
                  </span>
                  <span className="text-gray-400">{t("web.provider.reports.common.vsPriorPeriod")}</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("web.provider.reports.pages.sales/summary.appointmentsLedger")}</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {fmt(data.appointmentLedgerRevenue ?? data.totalRevenue)}
                  </p>
                </div>
                {(data.retailLedgerRevenue ?? 0) > 0 ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("web.provider.reports.pages.sales/summary.retailProductsLedger")}</p>
                    <p className="text-lg font-semibold text-gray-900">{fmt(data.retailLedgerRevenue ?? 0)}</p>
                    {data.retailOrderCount != null ? (
                      <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/summary.ordersCount", { count: data.retailOrderCount })}</p>
                    ) : null}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t("web.provider.reports.pages.sales/summary.retailProducts")}</p>
                    <p className="text-sm text-gray-500">{t("web.provider.reports.pages.sales/summary.noLedgerRetail")}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {data.recordedTakings ? (
            <Card className="border-gray-200 shadow-sm border-emerald-100 bg-emerald-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-emerald-900">
                  {t("web.provider.reports.pages.sales/summary.recordedTakings")}
                </CardTitle>
                <p className="text-xs text-emerald-800/90">
                  {t("web.provider.reports.pages.sales/summary.recordedTakingsHint")}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-3xl font-semibold tracking-tight text-emerald-950 tabular-nums">
                  {fmt(data.recordedTakings.total)}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <p className="text-gray-500">{t("web.provider.reports.pages.sales/summary.bookingPayments")}</p>
                    <p className="font-medium text-gray-900 tabular-nums">{fmt(data.recordedTakings.bookingPaymentsTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">{t("web.provider.reports.pages.sales/summary.walletOnBookings")}</p>
                    <p className="font-medium text-gray-900 tabular-nums">{fmt(data.recordedTakings.walletTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">{t("web.provider.reports.pages.sales/summary.retailLegacySales")}</p>
                    <p className="font-medium text-gray-900 tabular-nums">{fmt(data.recordedTakings.retailAndLegacySalesTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">{t("web.provider.reports.pages.sales/summary.tipsLedger")}</p>
                    <p className="font-medium text-gray-900 tabular-nums">{fmt(data.recordedTakings.tipsTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">{t("web.provider.reports.pages.sales/summary.cancellationFees")}</p>
                    <p className="font-medium text-gray-900 tabular-nums">{fmt(data.recordedTakings.cancellationFeesTotal)}</p>
                  </div>
                </div>
                {Object.entries(data.recordedTakings.byPaymentMethod).some(([, v]) => Number(v) > 0.005) ? (
                  <div className="border-t border-emerald-100 pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-900">{t("web.provider.reports.pages.sales/summary.byPaymentMethod")}</p>
                    <ul className="space-y-1 text-sm">
                      {Object.entries(data.recordedTakings.byPaymentMethod)
                        .filter(([, amt]) => Number(amt) > 0.005)
                        .sort((a, b) => Number(b[1]) - Number(a[1]))
                        .map(([method, amt]) => (
                          <li key={method} className="flex justify-between gap-4 tabular-nums">
                            <span className="capitalize text-gray-700">{method.replace(/_/g, " ")}</span>
                            <span className="font-medium text-gray-900">{fmt(Number(amt))}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/summary.scheduledAppointments")}</CardTitle>
                <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/summary.scheduledAppointmentsHint")}</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold text-gray-900">{data.totalBookings}</p>
                  <div className="flex items-center gap-1 text-sm font-medium">
                    {data.bookingsGrowth >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                    <span className={data.bookingsGrowth >= 0 ? "text-green-700" : "text-red-700"}>
                      {Math.abs(data.bookingsGrowth).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/summary.withLedgerActivity")}</CardTitle>
                <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/summary.withLedgerActivityHint")}</p>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-gray-900">
                  {data.bookingsWithLedgerActivity ?? t("web.provider.common.emDash")}
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm sm:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/summary.avgLedgerPerActive")}</CardTitle>
                <p className="text-xs text-gray-500">
                  {t("web.provider.reports.pages.sales/summary.avgLedgerPerActiveHint")}
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-2xl font-semibold text-gray-900">{fmt(data.averageBookingValue)}</p>
                <p className="text-xs text-gray-500">
                  {dateRange.from && format(dateRange.from, "MMM d, yyyy")}
                  {dateRange.to && ` – ${format(dateRange.to, "MMM d, yyyy")}`}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Revenue by Day Chart */}
        {data.revenueByDay.length > 0 && (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>{t("web.provider.reports.pages.sales/summary.revenueTrend")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">{t("web.provider.reports.pages.sales/summary.revenueTrendHint")}</p>
            </CardHeader>
            <CardContent>
              <RevenueChart data={data.revenueByDay} type="line" />
            </CardContent>
          </Card>
        )}

        {/* Revenue by Day Table */}
        {data.revenueByDay.length > 0 && (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>{t("web.provider.reports.pages.sales/summary.revenueByDay")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                {t("web.provider.reports.pages.sales/summary.revenueByDayHint")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {data.revenueByDay.map((day, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {format(new Date(day.date + "T12:00:00"), "MMM dd, yyyy")}
                      </p>
                      <p className="text-xs text-gray-600">
                        {t("web.provider.reports.pages.sales/summary.scheduledAppointmentsCount", { count: day.bookings })}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-gray-900">
                      {fmt(day.revenue)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Revenue by Service */}
        {data.revenueByService && data.revenueByService.length > 0 ? (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>{t("web.provider.reports.pages.sales/summary.revenueByService")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                {t("web.provider.reports.pages.sales/summary.revenueByServiceHint")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.revenueByService.map((service, index) => {
                  const isRetail = service.serviceName.includes("Retail & product");
                  return (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {service.serviceName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {t(isRetail ? "web.provider.reports.pages.sales/summary.ordersCount" : "web.provider.reports.pages.sales/summary.appointmentsCount", { count: service.bookings })}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-gray-900">
                      {fmt(service.revenue)}
                    </p>
                  </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>{t("web.provider.reports.pages.sales/summary.revenueByService")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                {t("web.provider.reports.pages.sales/summary.noServiceRevenue")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Revenue by Staff */}
        {data.revenueByStaff && data.revenueByStaff.length > 0 ? (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>{t("web.provider.reports.pages.sales/summary.revenueByStaff")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                {t("web.provider.reports.pages.sales/summary.revenueByStaffHint")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.revenueByStaff.map((staff, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {staff.staffName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {t("web.provider.reports.pages.sales/summary.appointmentsCount", { count: staff.bookings })}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-gray-900">
                      {fmt(staff.revenue)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>{t("web.provider.reports.pages.sales/summary.revenueByStaff")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                {t("web.provider.reports.pages.sales/summary.noStaffRevenue")}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
