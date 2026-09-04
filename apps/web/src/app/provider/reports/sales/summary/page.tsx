"use client";
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
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
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
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<SalesSummaryData | null>(null);
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

      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      appendLocation(params);

      const response = await fetcher.get<{ data: SalesSummaryData }>(
        `/api/provider/reports/sales/summary?${params.toString()}`,
        { timeoutMs: 120_000 },
      );
      setData(response.data);
    } catch (err) {
      if (err instanceof FetchError && err.code === "SUBSCRIPTION_REQUIRED") {
        setIsSubscriptionRequired(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load report");
        setIsSubscriptionRequired(false);
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
      exportToPDF("sales-summary-report", "sales-summary-report", "Sales Summary Report");
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Sales Summary" },
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
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Sales Summary" },
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title="Sales Summary"
            subtitle="Track revenue, bookings, and service performance"
          />
          <SubscriptionGate
            feature="Sales Summary Reports"
            message="Basic reports require a subscription upgrade."
            upgradeMessage="Upgrade your platform plan under Subscription to access sales analytics."
          />
        </div>
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
          { label: "Sales Summary" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load sales summary data"}
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
        { label: "Sales Summary" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="sales-summary-report">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Sales Summary"
            subtitle="Ledger net vs recorded takings and scheduled appointments"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Button variant="outline" onClick={() => handleExport("pdf")} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">PDF</span>
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
                Total recognized revenue
              </CardTitle>
              <p className="text-xs text-gray-500">
                Net provider amounts in finance_transactions for this period (earnings, travel, tips, and retail where ledgered).
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
                  <span className="text-gray-400">vs prior period</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Appointments (ledger)</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {fmt(data.appointmentLedgerRevenue ?? data.totalRevenue)}
                  </p>
                </div>
                {(data.retailLedgerRevenue ?? 0) > 0 ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Retail & products (ledger)</p>
                    <p className="text-lg font-semibold text-gray-900">{fmt(data.retailLedgerRevenue ?? 0)}</p>
                    {data.retailOrderCount != null ? (
                      <p className="text-xs text-gray-500">{data.retailOrderCount} order(s)</p>
                    ) : null}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Retail & products</p>
                    <p className="text-sm text-gray-500">No ledger retail in range</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {data.recordedTakings ? (
            <Card className="border-gray-200 shadow-sm border-emerald-100 bg-emerald-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-emerald-900">
                  Recorded takings (logged in-app)
                </CardTitle>
                <p className="text-xs text-emerald-800/90">
                  Cash-register style — not the same as platform settlement or bank deposits.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-3xl font-semibold tracking-tight text-emerald-950 tabular-nums">
                  {fmt(data.recordedTakings.total)}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <p className="text-gray-500">Booking payments</p>
                    <p className="font-medium text-gray-900 tabular-nums">{fmt(data.recordedTakings.bookingPaymentsTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Wallet on bookings</p>
                    <p className="font-medium text-gray-900 tabular-nums">{fmt(data.recordedTakings.walletTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Retail & legacy sales</p>
                    <p className="font-medium text-gray-900 tabular-nums">{fmt(data.recordedTakings.retailAndLegacySalesTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Tips (ledger)</p>
                    <p className="font-medium text-gray-900 tabular-nums">{fmt(data.recordedTakings.tipsTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Cancellation fees</p>
                    <p className="font-medium text-gray-900 tabular-nums">{fmt(data.recordedTakings.cancellationFeesTotal)}</p>
                  </div>
                </div>
                {Object.entries(data.recordedTakings.byPaymentMethod).some(([, v]) => Number(v) > 0.005) ? (
                  <div className="border-t border-emerald-100 pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-900">By payment method</p>
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
                <CardTitle className="text-sm font-medium text-gray-600">Scheduled appointments</CardTitle>
                <p className="text-xs text-gray-500">Service dates in range (all statuses).</p>
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
                <CardTitle className="text-sm font-medium text-gray-600">With ledger activity</CardTitle>
                <p className="text-xs text-gray-500">Appointments that had net ledger recognition in range.</p>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-gray-900">
                  {data.bookingsWithLedgerActivity ?? "—"}
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm sm:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Avg ledger per active appointment</CardTitle>
                <p className="text-xs text-gray-500">
                  Appointment ledger total ÷ appointments with activity (excludes retail-only orders).
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
              <CardTitle>Revenue trend</CardTitle>
              <p className="text-sm font-normal text-gray-500">Daily totals use ledger recognition dates.</p>
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
              <CardTitle>Revenue by day</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                Revenue column = ledger activity that day. Booking counts = appointments scheduled that calendar day (can differ).
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
                        {day.bookings} scheduled appointment{day.bookings !== 1 ? "s" : ""}
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
              <CardTitle>Revenue by service line</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                Appointment revenue split by booking line price share (each line uses its offering title — variants are separate offerings). Retail shown separately when present.
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
                        {service.bookings} {isRetail ? `order${service.bookings !== 1 ? "s" : ""}` : `appointment${service.bookings !== 1 ? "s" : ""}`}
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
              <CardTitle>Revenue by service line</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                No service revenue data available for the selected period.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Revenue by Staff */}
        {data.revenueByStaff && data.revenueByStaff.length > 0 ? (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Revenue by staff</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                Allocated from each booking’s ledger net by share of line items assigned to staff (retail not included).
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
                        {staff.bookings} appointment{staff.bookings !== 1 ? "s" : ""}
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
              <CardTitle>Revenue by staff</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                No staff revenue data available for the selected period.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
