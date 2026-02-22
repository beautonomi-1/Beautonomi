"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle2, XCircle, Clock, AlertCircle, Calendar } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, exportToPDF, formatReportDataForExport } from "../../utils/export";

interface BookingStatusData {
  statusBreakdown: {
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  totalBookings: number;
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
  bookingsByStatus: Array<{
    status: string;
    count: number;
    percentage: number;
    revenue: number;
  }>;
}

const statusConfig = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-800", icon: Calendar },
  completed: { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800", icon: XCircle },
  no_show: { label: "No Show", color: "bg-gray-100 text-gray-800", icon: AlertCircle },
};

export default function BookingStatusReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<BookingStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [dateRange]);

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

      const response = await fetcher.get<{ data: BookingStatusData }>(
        `/api/provider/reports/bookings/status?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading booking status:", err);
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

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Booking Status" },
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
          { label: "Booking Status" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load booking status data"}
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
        { label: "Booking Status" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="booking-status-report">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Booking Status Report"
            subtitle="Track booking completion and cancellation rates"
          />
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                if (!data) return;
                const exportData = formatReportDataForExport(data, "booking-status");
                exportToCSV(exportData, "booking-status-report");
              }} 
              className="gap-2 min-h-[44px] touch-manipulation"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                if (!data) return;
                exportToPDF("booking-status-report", "booking-status-report", "Booking Status Report");
              }} 
              className="gap-2 min-h-[44px] touch-manipulation"
            >
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

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Bookings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {data.totalBookings}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Completion Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.completionRate.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Cancellation Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.cancellationRate.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                No-Show Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-gray-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.noShowRate.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status Breakdown */}
        {data.bookingsByStatus && data.bookingsByStatus.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Booking Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.bookingsByStatus.map((item) => {
                const config = statusConfig[item.status as keyof typeof statusConfig];
                const Icon = config?.icon || Clock;
                const label = config?.label || item.status;

                return (
                  <div
                    key={item.status}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${config?.color || "bg-gray-100"}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{label}</p>
                        <p className="text-xs text-gray-600">
                          {item.count} booking{item.count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {item.percentage.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-600">
                        ZAR {item.revenue.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Booking Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                No booking data available for the selected period.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
