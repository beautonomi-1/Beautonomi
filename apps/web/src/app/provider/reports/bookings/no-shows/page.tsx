"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, UserX, DollarSign, AlertTriangle, Users } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface NoShowsData {
  totalNoShows: number;
  totalBookings: number;
  noShowRate: number;
  lostRevenue: number;
  repeatOffenders: Array<{
    name: string;
    email: string;
    count: number;
    revenue: number;
  }>;
  staffBreakdown: Array<{
    name: string;
    count: number;
  }>;
  recentNoShows: Array<{
    id: string;
    total_amount: number;
    scheduled_at: string;
    users: {
      full_name: string;
      email: string;
    } | null;
  }>;
}

export default function NoShowsReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<NoShowsData | null>(null);
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

      const response = await fetcher.get<{ data: NoShowsData }>(
        `/api/provider/reports/bookings/no-shows?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading no-shows:", err);
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
    const exportData = formatReportDataForExport(data, "no-shows");
    exportToCSV(exportData, "no-shows-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "No-Shows" },
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
          { label: "No-Shows" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load no-shows data"}
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
        { label: "No-Shows" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="No-Shows"
          subtitle="Track no-show bookings and identify patterns"
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
              <CardTitle className="text-sm font-medium text-gray-600">Total No-Shows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalNoShows}</p>
                <UserX className="w-5 h-5 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">No-Show Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.noShowRate.toFixed(1)}%
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
                <UserX className="w-5 h-5 text-gray-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Repeat Offenders */}
        {data.repeatOffenders.length > 0 && (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Repeat Offenders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.repeatOffenders.map((client, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{client.name}</p>
                      <p className="text-sm text-gray-600">{client.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">{client.count} no-shows</p>
                      <p className="text-sm text-gray-600">
                        ZAR {client.revenue.toLocaleString()} lost
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Staff Breakdown */}
        {data.staffBreakdown.length > 0 && (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>No-Shows by Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.staffBreakdown.map((staff, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <p className="font-medium text-gray-900">{staff.name}</p>
                    </div>
                    <p className="font-semibold text-gray-900">{staff.count} no-shows</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent No-Shows */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Recent No-Shows</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentNoShows.length === 0 ? (
              <EmptyReportState title="No no-shows" description="No no-shows in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.recentNoShows.map((booking) => (
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
                    </div>
                    <p className="font-semibold text-gray-900">
                      ZAR {Number(booking.total_amount || 0).toLocaleString()}
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
