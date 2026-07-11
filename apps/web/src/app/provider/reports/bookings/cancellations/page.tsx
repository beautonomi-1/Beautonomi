"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, XCircle, DollarSign, AlertTriangle, Info, CalendarDays } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../../utils/export";
import type { CancellationsReportResponse } from "@/app/api/provider/reports/bookings/cancellations/route";
import { CancellationsDailyChart, CancellationsReasonsChart } from "./components/CancellationsCharts";

export default function CancellationsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<CancellationsReportResponse | null>(null);
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

      const response = await fetcher.get<{ data: CancellationsReportResponse }>(
        `/api/provider/reports/bookings/cancellations?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading cancellations:", err);
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
    exportToPDF("cancellations-report", "cancellations-report", "Cancellations report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Cancellations" },
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
          { label: "Cancellations" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load cancellations data"}
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
        { label: "Cancellations" },
      ]}
      showCloseButton={false}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Cancellations"
          subtitle="Scheduled-window counts, reasons, and ledger-linked amounts posted in range"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportCsv} className="rounded-xl">
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" onClick={handleExportPdf} className="rounded-xl">
            Print / PDF
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
                <p className="font-medium text-sky-900">Facts & definitions</p>
                <p className="mt-1">{data.basisNote}</p>
                {data.ledgerTransactionTypes?.length ? (
                  <p className="mt-2 text-xs text-sky-900/85">
                    Ledger net types for “lost revenue”: {data.ledgerTransactionTypes.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Cancelled (scheduled in window)</CardTitle>
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
                <CardTitle className="text-sm font-medium text-gray-600">Cancellation rate</CardTitle>
                <p className="text-xs text-gray-500">Share of all appointments in window</p>
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
                <CardTitle className="text-sm font-medium text-gray-600">Ledger net (in window)</CardTitle>
                <p className="text-xs text-gray-500">Posted transactions for cancelled bookings</p>
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
                <CardTitle className="text-sm font-medium text-gray-600">Appointments in window</CardTitle>
                <p className="text-xs text-gray-500">Denominator for rate · {data.timezone ?? ""}</p>
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
                <CardTitle className="text-lg">Cancellations by day</CardTitle>
                <p className="text-sm font-normal text-gray-500">
                  Bucketed by cancellation local date (fallback: scheduled date if cancel time missing).
                </p>
              </CardHeader>
              <CardContent>
                <CancellationsDailyChart rows={data.dailyBreakdown} />
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Reason mix</CardTitle>
                <p className="text-sm font-normal text-gray-500">Percent of cancellations in this range (top 10 shown).</p>
              </CardHeader>
              <CardContent>
                <CancellationsReasonsChart rows={data.cancellationReasons} />
              </CardContent>
            </Card>
          </div>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">All reasons</CardTitle>
            </CardHeader>
            <CardContent>
              {data.cancellationReasons.length === 0 ? (
                <EmptyReportState title="No cancellation reasons" description="No cancellation reasons recorded." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/80">
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Reason</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Count</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cancellationReasons.map((reason) => (
                        <tr key={reason.reason} className="border-b border-gray-50 hover:bg-gray-50/60">
                          <td className="px-4 py-3 font-medium text-gray-900">{reason.reason}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-800">{reason.count}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-600">{reason.percentage.toFixed(1)}%</td>
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
              <CardTitle className="text-lg">Recent cancellations</CardTitle>
              <p className="text-sm font-normal text-gray-500">Newest first — detail sample for quick review.</p>
            </CardHeader>
            <CardContent>
              {data.recentCancellations.length === 0 ? (
                <EmptyReportState title="No cancellations" description="No cancellations in the selected period." />
              ) : (
                <div className="space-y-3">
                  {data.recentCancellations.map((booking) => (
                    <div
                      key={String(booking.id)}
                      className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/40 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {(booking.users as { full_name?: string } | null)?.full_name ?? "Unknown client"}
                        </p>
                        <p className="text-sm text-gray-600">
                          {booking.scheduled_at
                            ? format(new Date(String(booking.scheduled_at)), "MMM dd, yyyy 'at' h:mm a")
                            : "—"}
                        </p>
                        {booking.cancellation_reason ? (
                          <p className="mt-1 text-xs text-gray-500">Reason: {String(booking.cancellation_reason)}</p>
                        ) : null}
                      </div>
                      <div className="text-left sm:text-right">
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
