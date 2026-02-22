"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, TrendingDown, DollarSign, Calendar } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { RevenueChart } from "../../components/RevenueChart";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface RevenueTrendsData {
  period: string;
  trends: Array<{
    period: string;
    revenue: number;
    bookings: number;
  }>;
  totalRevenue: number;
  totalBookings: number;
  averageRevenue: number;
  revenueGrowth: number;
  bookingsGrowth: number;
}

export default function RevenueTrendsReport() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<RevenueTrendsData | null>(null);
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

      const response = await fetcher.get<{ data: RevenueTrendsData }>(
        `/api/provider/reports/sales/trends?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading revenue trends:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data, "revenue-trends");
    exportToCSV(exportData, "revenue-trends-report");
  };

  const formatPeriod = (periodStr: string) => {
    if (data?.period === "day") {
      return new Date(periodStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else if (data?.period === "week") {
      return `Week of ${new Date(periodStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    } else if (data?.period === "month") {
      const [year, month] = periodStr.split("-");
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
          { label: "Revenue Trends" },
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
          { label: "Revenue Trends" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load revenue trends data"}
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
        { label: "Revenue Trends" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Revenue Trends"
          subtitle="Track revenue and booking trends over time"
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
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="year">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.totalRevenue.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalBookings}</p>
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Revenue Growth</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {data.revenueGrowth >= 0 ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  )}
                  <p className={`text-2xl font-semibold ${data.revenueGrowth >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {data.revenueGrowth >= 0 ? "+" : ""}{data.revenueGrowth.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Revenue/Period</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averageRevenue.toLocaleString()}
                </p>
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {data.trends.length === 0 ? (
              <EmptyReportState title="No data available" description="No revenue data for the selected period." />
            ) : (
              <RevenueChart
                data={data.trends.map((t) => ({
                  date: t.period,
                  revenue: t.revenue,
                  bookings: t.bookings,
                }))}
                type="line"
                period={data.period}
              />
            )}
          </CardContent>
        </Card>

        {/* Trend Details */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Trend Details</CardTitle>
          </CardHeader>
          <CardContent>
            {data.trends.length === 0 ? (
              <EmptyReportState title="No trends found" description="No trend data available for the selected period." />
            ) : (
              <div className="space-y-3">
                {data.trends.map((trend) => (
                  <div
                    key={trend.period}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{formatPeriod(trend.period)}</p>
                      <p className="text-sm text-gray-600">
                        {trend.bookings} booking{trend.bookings !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <p className="font-semibold text-gray-900">
                      ZAR {trend.revenue.toLocaleString()}
                    </p>
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
