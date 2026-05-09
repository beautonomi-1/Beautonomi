"use client";
import { useReportExportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect, useCallback } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Users, TrendingUp, Repeat, Info, CalendarRange } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../../utils/export";
import type { ClientRetentionResponse } from "@/app/api/provider/reports/clients/retention/route";
import { ClientRetentionTrendChart, ClientRetentionVolumeChart } from "./components/ClientRetentionCharts";

export default function ClientRetentionReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const exportCurrency = useReportExportCurrency();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<ClientRetentionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [period, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append("period", period);
      appendLocation(params);

      const response = await fetcher.get<{ data: ClientRetentionResponse }>(
        `/api/provider/reports/clients/retention?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading client retention:", err);
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
    exportToPDF("client-retention-report", "client-retention-report", "Client retention report");
  };

  const formatPeriodLabel = useCallback(
    (periodStr: string) => {
      if (period === "month") {
        const [year, month] = periodStr.split("-");
        if (!year || !month) return periodStr;
        return new Date(parseInt(year, 10), parseInt(month, 10) - 1).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });
      }
      if (period === "quarter") {
        const m = periodStr.match(/^(\d{4})-Q(\d)$/);
        if (m) return `Q${m[2]} ${m[1]}`;
        return periodStr.replace("-", " ");
      }
      return periodStr;
    },
    [period],
  );

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Client Retention" },
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
          { label: "Client Retention" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load client retention data"}
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
        { label: "Client Retention" },
      ]}
      showCloseButton={false}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Client Retention"
          subtitle="Completed visits only — repeat share and period-over-period overlap"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportCsv} className="gap-2 rounded-xl">
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" onClick={handleExportPdf} className="gap-2 rounded-xl">
            PDF
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
              <SelectItem value="month">Monthly buckets</SelectItem>
              <SelectItem value="quarter">Quarterly buckets</SelectItem>
              <SelectItem value="year">Yearly buckets</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarRange className="h-4 w-4 shrink-0 text-gray-500" />
            <span>
              Window {data.analysisFromYmd} → {data.analysisToYmd} · ~{data.monthsOfHistory} mo lookback ·{" "}
              {data.timezone}
            </span>
          </div>
        </div>

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
              <CardTitle className="text-sm font-medium text-gray-600">Distinct clients</CardTitle>
              <p className="text-xs text-gray-500">With ≥1 completed visit in window</p>
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
              <CardTitle className="text-sm font-medium text-gray-600">Single-visit clients</CardTitle>
              <p className="text-xs text-gray-500">Exactly one completed visit</p>
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
              <CardTitle className="text-sm font-medium text-gray-600">Repeat clients</CardTitle>
              <p className="text-xs text-gray-500">Two or more completed visits</p>
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
              <CardTitle className="text-sm font-medium text-gray-600">Repeat share</CardTitle>
              <p className="text-xs text-gray-500">Repeat ÷ distinct clients</p>
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
            <CardTitle className="text-sm font-medium text-gray-600">Avg completed visits / client</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.averageVisitsPerClient.toFixed(2)}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Period-over-period retention</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                Of clients active in the prior bucket, what fraction came back in this bucket (completed visits).
              </p>
            </CardHeader>
            <CardContent>
              <ClientRetentionTrendChart rows={data.retentionByPeriod} formatPeriodLabel={formatPeriodLabel} />
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Prior bucket vs carry-over</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                Gray = distinct clients in the prior period bucket; rose = also booked again this period.
              </p>
            </CardHeader>
            <CardContent>
              <ClientRetentionVolumeChart rows={data.retentionByPeriod} formatPeriodLabel={formatPeriodLabel} />
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Period detail</CardTitle>
          </CardHeader>
          <CardContent>
            {data.retentionByPeriod.length === 0 ? (
              <EmptyReportState
                title="No chained periods yet"
                description="Retention vs prior appears once there are at least two buckets (e.g. two months of completed visits)."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80">
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Period</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Prior bucket</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Returned</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Retention</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Clients (bucket)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.retentionByPeriod.map((item) => (
                      <tr key={item.period} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-3 font-medium text-gray-900">{formatPeriodLabel(item.period)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{item.clientsInPriorPeriod}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{item.returnedFromPriorPeriod}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-rose-800">
                          {item.retentionRate.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-800">{item.clients}</td>
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
