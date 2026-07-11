"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useMemo, useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Layers, CalendarCheck, Wallet, Sparkles, Info } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
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
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<ServicePerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const response = await fetcher.get<{ data: ServicePerformanceData }>(
        `/api/provider/reports/sales/services?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading service performance:", err);
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
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Sales by service" },
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
          { label: "Sales by service" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load service performance data"}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Sales by service" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="service-performance-report">
        <PageHeader
          title="Sales by service"
          subtitle="Ledger net allocated to each offering — completed visits only"
          actions={
            <Button variant="outline" className="min-h-[44px] touch-manipulation gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export CSV
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
              <p className="font-medium text-violet-900">Accounting basis</p>
              <p className="mt-1 text-violet-950/95">{data.basisNote}</p>
              {data.ledgerTransactionTypes?.length ? (
                <p className="mt-2 text-xs text-violet-800/90">
                  Ledger types: {data.ledgerTransactionTypes.join(", ")}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Distinct offerings</CardTitle>
              <p className="text-xs text-gray-500">Services sold in this period</p>
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
              <CardTitle className="text-sm font-medium text-gray-600">Completed appointments</CardTitle>
              <p className="text-xs text-gray-500">Unique bookings in date range</p>
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
              <CardTitle className="text-sm font-medium text-gray-600">Ledger net (allocated)</CardTitle>
              <p className="text-xs text-gray-500">Sum of proportional splits</p>
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
              <CardTitle className="text-sm font-medium text-gray-600">Avg per offering row</CardTitle>
              <p className="text-xs text-gray-500">Total ledger ÷ distinct services</p>
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
            <CardTitle className="text-lg">Top services</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              Ranked by allocated ledger net. Bar shows share of total on this report.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topServices.length === 0 ? (
              <EmptyReportState title="No services" description="No completed bookings with services in the selected period." />
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
                              <span className="text-gray-400"> · {service.duration} min</span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums text-gray-900">{fmt(service.revenue)}</p>
                        <p className="text-xs tabular-nums text-gray-500">
                          {service.bookings} visit{service.bookings !== 1 ? "s" : ""} · {fmt(avg)} avg
                        </p>
                        <p className="text-xs font-medium tabular-nums text-violet-700">{service.pct.toFixed(1)}% of total</p>
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
            <CardTitle className="text-lg">By category</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              Unique visits per category — multi-service bookings count once per category when they include that category.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.categoryPerformance.length === 0 ? (
              <EmptyReportState title="No categories" description="No category data for this period." />
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
                        {category.services} offering{category.services !== 1 ? "s" : ""} · {category.bookings} visit
                        {category.bookings !== 1 ? "s" : ""}
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
