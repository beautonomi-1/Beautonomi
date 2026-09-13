"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useMemo, useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Layers, CalendarCheck, Wallet, Sparkles, Info } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface ServiceRow {
  serviceId: string;
  serviceName: string;
  category: string;
  duration: number;
  bookings: number;
  revenue: number;
  averageRevenuePerBooking?: number;
  averagePrice?: number;
}

interface ServicePerformanceData {
  totalServices: number;
  totalBookings: number;
  totalRevenue: number;
  averageServiceRevenue: number;
  topServices: ServiceRow[];
  categoryPerformance: Array<{
    categoryName: string;
    services: number;
    bookings: number;
    revenue: number;
  }>;
  allServices: ServiceRow[];
  ledgerTransactionTypes?: string[];
  basisNote?: string;
  reportBasis?: string;
}

export default function ServicePerformanceReport() {
  const { t } = useTranslation();
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<ServicePerformanceData | null>(null);
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

      const response = await fetcher.get<{ data: ServicePerformanceData }>(
        `/api/provider/reports/sales/services?${params.toString()}`
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

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "service-performance", exportCurrency);
    exportToCSV(exportData, "service-performance-report");
  };

  const totalRev = data?.totalRevenue ?? 0;

  const topWithPct = useMemo(() => {
    if (!data?.topServices?.length || totalRev <= 0) return [];
    return data.topServices.map((s) => ({
      ...s,
      pct: Math.min(100, Math.max(0, (s.revenue / totalRev) * 100)),
    }));
  }, [data?.topServices, totalRev]);

  const categoryWithPct = useMemo(() => {
    if (!data?.categoryPerformance?.length || totalRev <= 0) return [];
    return data.categoryPerformance.map((c) => ({
      ...c,
      pct: Math.min(100, Math.max(0, (c.revenue / totalRev) * 100)),
    }));
  }, [data?.categoryPerformance, totalRev]);

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.sales/services.title") },
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
          { label: t("web.provider.reports.pages.sales/services.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.sales/services.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.sales/services.title")} />
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
          { label: t("web.provider.reports.pages.sales/services.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.sales/services.unableToLoad")}
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
        { label: t("web.provider.reports.pages.sales/services.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="service-performance-report">
        <PageHeader
          title={t("web.provider.reports.pages.sales/services.title")}
          subtitle={t("web.provider.reports.pages.sales/services.subtitle")}
          actions={
            <Button variant="outline" className="min-h-[44px] touch-manipulation gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              {t("web.provider.common.exportCsv")}
            </Button>
          }
        />

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        {data.basisNote ? (
          <div className="flex gap-3 rounded-xl border border-violet-200/90 bg-violet-50/95 px-4 py-3 text-sm leading-relaxed text-violet-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" aria-hidden />
            <div>
              <p className="font-medium text-violet-900">{t("web.provider.reports.pages.sales/services.accountingBasis")}</p>
              <p className="mt-1 text-violet-950/95">{data.basisNote}</p>
              {data.ledgerTransactionTypes?.length ? (
                <p className="mt-2 text-xs text-violet-800/90">
                  {t("web.provider.reports.pages.sales/services.ledgerTypes", { types: data.ledgerTransactionTypes.join(", ") })}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/services.distinctOfferings")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/services.servicesSold")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{data.totalServices}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50">
                  <Layers className="h-5 w-5 text-sky-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/services.completedAppointments")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/services.uniqueBookings")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{data.totalBookings}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                  <CalendarCheck className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/services.ledgerNetAllocated")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/services.proportionalSplits")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{fmt(data.totalRevenue)}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                  <Wallet className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.sales/services.avgPerOffering")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.sales/services.avgHint")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
                  {fmt(data.averageServiceRevenue)}
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <Sparkles className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Services */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t("web.provider.reports.pages.sales/services.topServices")}</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              {t("web.provider.reports.pages.sales/services.topServicesHint")}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topServices.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.sales/services.noServices")} description={t("web.provider.reports.pages.sales/services.noServicesDesc")} />
            ) : (
              topWithPct.map((service, index) => {
                const avg =
                  service.averageRevenuePerBooking ??
                  service.averagePrice ??
                  (service.bookings > 0 ? service.revenue / service.bookings : 0);
                return (
                  <div
                    key={service.serviceId}
                    className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50/80"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">{service.serviceName}</p>
                          <p className="text-sm text-gray-500">
                            {service.category}
                            {service.duration ? (
                              <span className="text-gray-400">{t("web.provider.reports.pages.sales/services.durationMin", { count: service.duration })}</span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <div className="text-end">
                        <p className="font-semibold tabular-nums text-gray-900">{fmt(service.revenue)}</p>
                        <p className="text-xs tabular-nums text-gray-500">
                          {t("web.provider.reports.pages.sales/services.visitsAvg", { count: service.bookings, avg: fmt(avg) })}
                        </p>
                        <p className="text-xs font-medium tabular-nums text-violet-700">{t("web.provider.reports.pages.sales/services.pctOfTotal", { pct: service.pct.toFixed(1) })}</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                        style={{ width: `${service.pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Category Performance */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t("web.provider.reports.pages.sales/services.byCategory")}</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              {t("web.provider.reports.pages.sales/services.byCategoryHint")}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.categoryPerformance.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.sales/services.noCategories")} description={t("web.provider.reports.pages.sales/services.noCategoriesDesc")} />
            ) : (
              categoryWithPct.map((category) => (
                <div
                  key={category.categoryName}
                  className="rounded-xl border border-gray-100 bg-gray-50/40 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900">{category.categoryName}</p>
                      <p className="text-sm text-gray-600">
                        {t("web.provider.reports.pages.sales/services.offering", { count: category.services })} · {t("web.provider.reports.pages.sales/services.visit", { count: category.bookings })}
                      </p>
                    </div>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">{fmt(category.revenue)}</p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                      style={{ width: `${category.pct}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
