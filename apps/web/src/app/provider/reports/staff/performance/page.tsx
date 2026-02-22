"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Users, Clock, DollarSign, Star } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { exportToCSV, exportToPDF, formatReportDataForExport } from "../../utils/export";

interface StaffPerformanceData {
  staffMembers: Array<{
    staffId: string;
    staffName: string;
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    noShows: number;
    totalRevenue: number;
    averageBookingValue: number;
    totalHours: number;
    averageRating: number;
    totalReviews: number;
    commissionEarned: number;
  }>;
  summary: {
    totalStaff: number;
    totalBookings: number;
    totalRevenue: number;
    averageRating: number;
  };
}

export default function StaffPerformanceReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<StaffPerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadReport();
  }, [dateRange, selectedStaff]);

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
      if (selectedStaff) {
        params.append("staffId", selectedStaff);
      }

      const response = await fetcher.get<{ data: StaffPerformanceData }>(
        `/api/provider/reports/staff/performance?${params.toString()}`
      );
      setData(response.data);

      // Extract staff options from response
      if (response.data.staffMembers) {
        setStaffOptions(
          response.data.staffMembers.map((staff) => ({
            id: staff.staffId,
            name: staff.staffName,
          }))
        );
      }
    } catch (err) {
      if (err instanceof FetchError && err.code === "SUBSCRIPTION_REQUIRED") {
        setIsSubscriptionRequired(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load report");
        setIsSubscriptionRequired(false);
      }
      console.error("Error loading staff performance:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setDateRange({
      from: subDays(new Date(), 30),
      to: new Date(),
    });
    setSelectedStaff(null);
  };

  const handleExport = (format: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (format === "csv") {
      const exportData = formatReportDataForExport(data, "staff-performance");
      exportToCSV(exportData, "staff-performance-report");
    } else {
      exportToPDF("staff-performance-report", "staff-performance-report", "Staff Performance Report");
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Staff Performance" },
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
          { label: "Staff Performance" },
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title="Staff Performance"
            subtitle="Track team member productivity and performance"
          />
          <SubscriptionGate
            feature="Staff Performance Reports"
            message="Advanced reports require a Professional plan or higher."
            upgradeMessage="Upgrade to access detailed staff analytics, performance metrics, and commission tracking."
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
          { label: "Staff Performance" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load staff performance data"}
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
        { label: "Staff Performance" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="staff-performance-report">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Staff Performance"
            subtitle="Track team member productivity and performance"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Button variant="outline" onClick={() => handleExport("pdf")} className="gap-2 min-h-[44px] touch-manipulation">
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
          showStaffFilter={true}
          staffOptions={staffOptions}
          selectedStaff={selectedStaff}
          onStaffChange={setSelectedStaff}
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.summary.totalStaff}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Bookings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.summary.totalBookings}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.summary.totalRevenue.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Average Rating
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.summary.averageRating.toFixed(1)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Staff Performance Table */}
        {data.staffMembers && data.staffMembers.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Staff Performance Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Staff Member
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Bookings
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Completed
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Revenue
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Avg Value
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Rating
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Commission
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.staffMembers.map((staff, _index) => (
                    <tr
                      key={staff.staffId}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {staff.staffName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {staff.totalHours.toFixed(1)} hours
                          </p>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 text-sm text-gray-900">
                        {staff.totalBookings}
                      </td>
                      <td className="text-right py-3 px-4 text-sm text-gray-900">
                        <div className="flex items-center justify-end gap-1">
                          <span>{staff.completedBookings}</span>
                          {staff.cancelledBookings > 0 && (
                            <span className="text-xs text-red-600">
                              ({staff.cancelledBookings} cancelled)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 text-sm font-semibold text-gray-900">
                        ZAR {staff.totalRevenue.toLocaleString()}
                      </td>
                      <td className="text-right py-3 px-4 text-sm text-gray-600">
                        ZAR {staff.averageBookingValue.toLocaleString()}
                      </td>
                      <td className="text-right py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="text-sm text-gray-900">
                            {staff.averageRating.toFixed(1)}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({staff.totalReviews})
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 text-sm font-semibold text-green-600">
                        ZAR {staff.commissionEarned.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Staff Performance Details</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                No staff performance data available for the selected period.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
