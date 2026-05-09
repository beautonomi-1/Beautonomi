"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Users, TrendingUp, DollarSign, Calendar, Star, Info, Repeat } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../../utils/export";
import type { ClientSummaryResponse } from "@/app/api/provider/reports/clients/summary/route";
import { ClientSpendBarChart } from "./components/ClientSummaryCharts";

export default function ClientSummaryReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });
  const [data, setData] = useState<ClientSummaryResponse | null>(null);
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
      if (dateRange.from) {
        params.append("from", dateRange.from.toISOString());
      }
      if (dateRange.to) {
        params.append("to", dateRange.to.toISOString());
      }
      appendLocation(params);

      const response = await fetcher.get<{ data: ClientSummaryResponse }>(
        `/api/provider/reports/clients/summary?${params.toString()}`
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
      console.error("Error loading client summary:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setDateRange({
      from: subDays(new Date(), 90),
      to: new Date(),
    });
  };

  const handleExport = (format: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (format === "csv") {
      const exportData = formatReportDataForExport(data as unknown as ReportRow, "client-summary", exportCurrency);
      exportToCSV(exportData, "client-summary-report");
    } else {
      exportToPDF("client-summary-report", "client-summary-report", "Client Summary Report");
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Client Summary" },
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
          { label: "Client Summary" },
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title="Client Summary"
            subtitle="Understand your client base and retention"
          />
          <SubscriptionGate
            feature="Client Summary Reports"
            message="Advanced reports require a Professional plan or higher."
            upgradeMessage="Upgrade to access detailed client analytics, retention metrics, and lifetime value tracking."
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
          { label: "Client Summary" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load client summary data"}
        />
      </SettingsDetailLayout>
    );
  }

  const spendChartRows = data.topClients.map((c) => ({
    clientName: c.clientName,
    totalSpent: c.totalSpent,
  }));

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Client Summary" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="client-summary-report">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            title="Client Summary"
            subtitle="Distinct clients, first visits, repeats in range — spend sums booking totals in window"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")} className="min-h-[44px] gap-2 touch-manipulation">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button variant="outline" onClick={() => handleExport("pdf")} className="min-h-[44px] gap-2 touch-manipulation">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
          </div>
        </div>

        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} onReset={handleReset} />

        {data.basisNote ? (
          <div className="flex gap-3 rounded-xl border border-sky-200/90 bg-sky-50/95 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden />
            <div>
              <p className="font-medium text-sky-900">Facts & definitions</p>
              <p className="mt-1">{data.basisNote}</p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Clients (in window)</CardTitle>
              <p className="text-xs text-gray-500">Distinct customers with an appointment scheduled</p>
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
              <CardTitle className="text-sm font-medium text-gray-600">New clients</CardTitle>
              <p className="text-xs text-gray-500">First-ever booking in scope falls in range</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-emerald-900">{data.newClients}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg spend / client</CardTitle>
              <p className="text-xs text-gray-500">Mean of Σ booking totals in window</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{fmt(data.averageLifetimeValue)}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                  <DollarSign className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg bookings / client</CardTitle>
              <p className="text-xs text-gray-500">In reporting window</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
                  {data.averageBookingsPerClient.toFixed(1)}
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
                  <Calendar className="h-5 w-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Repeat className="h-5 w-5 text-indigo-600" />
                Repeat visits in window
              </CardTitle>
              <p className="text-sm font-normal text-gray-500">
                {data.returningClients} clients had 2+ appointments scheduled in this range ({data.totalClients} active
                clients).
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/95 to-fuchsia-50/80 px-5 py-4">
                <p className="text-sm text-gray-600">Retention rate</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
                  {data.clientRetention.retentionRate.toFixed(1)}%
                </p>
                <p className="mt-2 text-xs text-gray-600">
                  Window: {data.clientRetention.inclusiveDayCount} inclusive days · {data.timezone}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Top spenders (in window)</CardTitle>
              <p className="text-sm font-normal text-gray-500">Sum of booking.total_amount per customer · top 10.</p>
            </CardHeader>
            <CardContent>
              <ClientSpendBarChart rows={spendChartRows} formatMoney={fmt} />
            </CardContent>
          </Card>
        </div>

        {data.topClients && data.topClients.length > 0 ? (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Client detail</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80">
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Client</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Bookings</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Σ totals</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Rating</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Last visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topClients.map((client, index) => (
                      <tr key={client.clientId} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-rose-600 text-sm font-semibold text-white">
                              {index + 1}
                            </span>
                            <span className="font-medium text-gray-900">{client.clientName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-800">{client.totalBookings}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">{fmt(client.totalSpent)}</td>
                        <td className="px-4 py-3 text-right">
                          {client.averageRating > 0 ? (
                            <span className="inline-flex items-center gap-1 tabular-nums text-gray-800">
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                              {client.averageRating.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {new Date(client.lastVisit).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Top clients</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="py-8 text-center text-sm text-gray-600">No client data for the selected filters.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
