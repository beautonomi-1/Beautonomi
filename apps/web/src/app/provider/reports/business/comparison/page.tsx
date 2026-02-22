"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface BusinessComparisonData {
  period: string;
  current: {
    revenue: number;
    bookings: number;
    completed: number;
    clients: number;
    averageValue: number;
  };
  previous: {
    revenue: number;
    bookings: number;
    completed: number;
    clients: number;
    averageValue: number;
  };
  growth: {
    revenue: number;
    bookings: number;
    clients: number;
  };
}

export default function BusinessComparisonReport() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<BusinessComparisonData | null>(null);
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

      const response = await fetcher.get<{ data: BusinessComparisonData }>(
        `/api/provider/reports/business/comparison?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading business comparison:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data, "business-comparison");
    exportToCSV(exportData, "business-comparison-report");
  };

  const formatPeriod = (p: string) => {
    switch (p) {
      case "month":
        return "Month";
      case "quarter":
        return "Quarter";
      case "year":
        return "Year";
      default:
        return p;
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Period Comparison" },
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
          { label: "Period Comparison" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load comparison data"}
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
        { label: "Period Comparison" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Period Comparison"
          subtitle="Compare performance across different time periods"
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

        {/* Comparison Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Comparison */}
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Current {formatPeriod(period)}</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    ZAR {data.current.revenue.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Previous {formatPeriod(period)}</p>
                  <p className="text-xl font-medium text-gray-700">
                    ZAR {data.previous.revenue.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  {data.growth.revenue >= 0 ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  )}
                  <p className={`text-lg font-semibold ${data.growth.revenue >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {data.growth.revenue >= 0 ? "+" : ""}{data.growth.revenue.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bookings Comparison */}
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Current {formatPeriod(period)}</p>
                  <p className="text-2xl font-semibold text-gray-900">{data.current.bookings}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Previous {formatPeriod(period)}</p>
                  <p className="text-xl font-medium text-gray-700">{data.previous.bookings}</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  {data.growth.bookings >= 0 ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  )}
                  <p className={`text-lg font-semibold ${data.growth.bookings >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {data.growth.bookings >= 0 ? "+" : ""}{data.growth.bookings.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clients Comparison */}
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Current {formatPeriod(period)}</p>
                  <p className="text-2xl font-semibold text-gray-900">{data.current.clients}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Previous {formatPeriod(period)}</p>
                  <p className="text-xl font-medium text-gray-700">{data.previous.clients}</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  {data.growth.clients >= 0 ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  )}
                  <p className={`text-lg font-semibold ${data.growth.clients >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {data.growth.clients >= 0 ? "+" : ""}{data.growth.clients.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Average Value Comparison */}
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Average Booking Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Current {formatPeriod(period)}</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    ZAR {data.current.averageValue.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Previous {formatPeriod(period)}</p>
                  <p className="text-xl font-medium text-gray-700">
                    ZAR {data.previous.averageValue.toLocaleString()}
                  </p>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm text-gray-600">
                    Change: {((data.current.averageValue - data.previous.averageValue) / (data.previous.averageValue || 1) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
