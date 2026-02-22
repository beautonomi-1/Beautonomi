"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, XCircle, DollarSign, AlertTriangle } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface CancellationsData {
  totalCancelled: number;
  totalBookings: number;
  cancellationRate: number;
  lostRevenue: number;
  cancellationReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    count: number;
  }>;
  recentCancellations: Array<{
    id: string;
    total_amount: number;
    scheduled_at: string;
    cancelled_at: string;
    cancellation_reason: string;
    users: {
      full_name: string;
      email: string;
    } | null;
  }>;
}

export default function CancellationsReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<CancellationsData | null>(null);
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

      const response = await fetcher.get<{ data: CancellationsData }>(
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

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data, "cancellations");
    exportToCSV(exportData, "cancellations-report");
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
      <div className="space-y-6">
        <PageHeader
          title="Cancellations"
          subtitle="Track booking cancellations and lost revenue"
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          }
        />

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Cancelled</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalCancelled}</p>
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Cancellation Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.cancellationRate.toFixed(1)}%
                </p>
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Lost Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.lostRevenue.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-red-600" />
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
                <XCircle className="w-5 h-5 text-gray-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cancellation Reasons */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Cancellation Reasons</CardTitle>
          </CardHeader>
          <CardContent>
            {data.cancellationReasons.length === 0 ? (
              <EmptyReportState title="No cancellation reasons" description="No cancellation reasons available." />
            ) : (
              <div className="space-y-3">
                {data.cancellationReasons.map((reason) => (
                  <div
                    key={reason.reason}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{reason.reason}</p>
                      <p className="text-sm text-gray-600">
                        {reason.percentage.toFixed(1)}% of cancellations
                      </p>
                    </div>
                    <p className="font-semibold text-gray-900">{reason.count} cancellations</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Cancellations */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Recent Cancellations</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentCancellations.length === 0 ? (
              <EmptyReportState title="No cancellations" description="No cancellations in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.recentCancellations.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {booking.users?.full_name || "Unknown Client"}
                      </p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(booking.scheduled_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                      {booking.cancellation_reason && (
                        <p className="text-xs text-gray-500 mt-1">
                          Reason: {booking.cancellation_reason}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        ZAR {Number(booking.total_amount || 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(booking.cancelled_at || booking.scheduled_at), "MMM dd")}
                      </p>
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
