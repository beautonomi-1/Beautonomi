"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Users, TrendingUp, Repeat } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface ClientRetentionData {
  totalClients: number;
  newClients: number;
  returningClients: number;
  overallRetentionRate: number;
  averageVisitsPerClient: number;
  retentionByPeriod: Array<{
    period: string;
    retentionRate: number;
    clients: number;
  }>;
}

export default function ClientRetentionReport() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<ClientRetentionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [period]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append("period", period);

      const response = await fetcher.get<{ data: ClientRetentionData }>(
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

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data, "client-retention");
    exportToCSV(exportData, "client-retention-report");
  };

  const formatPeriod = (periodStr: string) => {
    if (period === "month") {
      const [year, month] = periodStr.split("-");
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } else if (period === "quarter") {
      return periodStr.replace("-", " ");
    } else {
      return periodStr;
    }
  };

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
      <div className="space-y-6">
        <PageHeader
          title="Client Retention"
          subtitle="Track client retention and repeat visit rates"
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          }
        />

        {/* Period Selector */}
        <div className="flex items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="quarter">Quarterly</SelectItem>
              <SelectItem value="year">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalClients}</p>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Returning Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.returningClients}</p>
                <Repeat className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Retention Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.overallRetentionRate.toFixed(1)}%
                </p>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Visits/Client</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.averageVisitsPerClient.toFixed(1)}
                </p>
                <TrendingUp className="w-5 h-5 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Retention by Period */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Retention by Period</CardTitle>
          </CardHeader>
          <CardContent>
            {data.retentionByPeriod.length === 0 ? (
              <EmptyReportState title="No retention data" description="No retention data available for the selected period." />
            ) : (
              <div className="space-y-3">
                {data.retentionByPeriod.map((item) => (
                  <div
                    key={item.period}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{formatPeriod(item.period)}</p>
                      <p className="text-sm text-gray-600">{item.clients} clients</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-semibold ${item.retentionRate >= 50 ? "text-green-600" : item.retentionRate >= 30 ? "text-orange-600" : "text-red-600"}`}>
                        {item.retentionRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">retention</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
