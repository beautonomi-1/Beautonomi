"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, DollarSign, Calendar, Clock } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, exportToPDF, formatReportDataForExport } from "../../utils/export";

interface BusinessDashboardData {
  today: {
    revenue: number;
    bookings: number;
    completed: number;
  };
  week: {
    revenue: number;
    bookings: number;
  };
  month: {
    revenue: number;
    bookings: number;
    clients: number;
  };
  upcomingBookings: Array<{
    id: string;
    scheduled_at: string;
    status: string;
    total_amount: number;
  }>;
  recentBookings: Array<{
    id: string;
    scheduled_at: string;
    status: string;
    total_amount: number;
  }>;
}

export default function BusinessDashboardReport() {
  const [data, setData] = useState<BusinessDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: BusinessDashboardData }>(
        `/api/provider/reports/business/dashboard`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading business dashboard:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = (format: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (format === "csv") {
      const exportData = formatReportDataForExport(data, "business-dashboard");
      exportToCSV(exportData, "business-dashboard-report");
    } else {
      exportToPDF("business-dashboard-report", "business-dashboard-report", "Business Performance Dashboard");
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Performance Dashboard" },
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
          { label: "Performance Dashboard" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load dashboard data"}
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
        { label: "Performance Dashboard" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="business-dashboard-report">
        <PageHeader
          title="Performance Dashboard"
          subtitle="Real-time view of your business performance"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleExport("csv")}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => handleExport("pdf")}>
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </div>
          }
        />

        {/* Today's Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Today's Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.today.revenue.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Today's Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.today.bookings}</p>
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-xs text-gray-500 mt-1">{data.today.completed} completed</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-semibold text-gray-900">
                    ZAR {data.week.revenue.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{data.week.bookings} bookings</p>
                </div>
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* This Month */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Revenue</p>
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.month.revenue.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Bookings</p>
                <p className="text-2xl font-semibold text-gray-900">{data.month.bookings}</p>
              </div>
              <div className="p-3 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Clients</p>
                <p className="text-2xl font-semibold text-gray-900">{data.month.clients}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Bookings */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Upcoming Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingBookings.length === 0 ? (
              <EmptyReportState title="No upcoming bookings" description="No upcoming bookings scheduled." />
            ) : (
              <div className="space-y-3">
                {data.upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-gray-900">
                          {format(new Date(booking.scheduled_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                        <p className="text-sm text-gray-600">{booking.status}</p>
                      </div>
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

        {/* Recent Bookings */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Recent Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentBookings.length === 0 ? (
              <EmptyReportState title="No recent bookings" description="No recent bookings found." />
            ) : (
              <div className="space-y-3">
                {data.recentBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-gray-600" />
                      <div>
                        <p className="font-medium text-gray-900">
                          {format(new Date(booking.scheduled_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                        <p className="text-sm text-gray-600">{booking.status}</p>
                      </div>
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
