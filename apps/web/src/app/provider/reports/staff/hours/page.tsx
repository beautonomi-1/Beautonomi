"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Clock, TrendingUp, CheckCircle } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface StaffHoursData {
  totalHours: number;
  totalScheduledHours: number;
  averageHoursPerStaff: number;
  staffHours: Array<{
    staffId: string;
    staffName: string;
    totalHours: number;
    scheduledHours: number;
    completedBookings: number;
    onTimeBookings: number;
    averageHoursPerDay: number;
    attendanceRate: number;
    onTimeRate: number;
  }>;
}

export default function StaffHoursReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<StaffHoursData | null>(null);
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

      const response = await fetcher.get<{ data: StaffHoursData }>(
        `/api/provider/reports/staff/hours?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading staff hours:", err);
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
    const exportData = formatReportDataForExport(data, "staff-hours");
    exportToCSV(exportData, "staff-hours-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Hours & Attendance" },
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
          { label: "Hours & Attendance" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load staff hours data"}
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
        { label: "Hours & Attendance" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Hours & Attendance"
          subtitle="Track staff working hours and attendance"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.totalHours.toFixed(1)}h
                </p>
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Scheduled Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.totalScheduledHours.toFixed(1)}h
                </p>
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Hours/Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.averageHoursPerStaff.toFixed(1)}h
                </p>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Staff Hours Table */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Staff Hours Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {data.staffHours.length === 0 ? (
              <EmptyReportState title="No hours data" description="No hours data available for the selected period." />
            ) : (
              <div className="space-y-3">
                {data.staffHours.map((staff) => (
                  <div
                    key={staff.staffId}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <Clock className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{staff.staffName}</p>
                        <p className="text-sm text-gray-600">
                          {staff.completedBookings} completed • {staff.onTimeBookings} on-time
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {staff.totalHours.toFixed(1)}h
                      </p>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">
                          {staff.attendanceRate.toFixed(0)}% attendance
                        </span>
                        {staff.attendanceRate >= 90 && (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        )}
                      </div>
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
