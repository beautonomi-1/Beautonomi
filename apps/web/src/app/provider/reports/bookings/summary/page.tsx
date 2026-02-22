"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Calendar, DollarSign, TrendingUp } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { RevenueChart } from "../../components/RevenueChart";
import { exportToCSV, exportToPDF, formatReportDataForExport } from "../../utils/export";

interface BookingSummaryData {
  totalBookings: number;
  totalRevenue: number;
  averageBookingValue: number;
  statusBreakdown: Array<{
    status: string;
    count: number;
    revenue: number;
    percentage: number;
  }>;
  dailyBookings: Array<{
    date: string;
    count: number;
    revenue: number;
  }>;
  topServices: Array<{
    serviceName: string;
    bookings: number;
    revenue: number;
  }>;
}

export default function BookingSummaryReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<BookingSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

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

      const response = await fetcher.get<{ data: BookingSummaryData }>(
        `/api/provider/reports/bookings/summary?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      if (err instanceof FetchError && err.code === "SUBSCRIPTION_REQUIRED") {
        setIsSubscriptionRequired(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load report");
        setIsSubscriptionRequired(false);
      }
      console.error("Error loading booking summary:", err);
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

  const handleExport = (format: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (format === "csv") {
      const exportData = formatReportDataForExport(data, "booking-summary");
      exportToCSV(exportData, "booking-summary-report");
    } else {
      exportToPDF("booking-summary-report", "booking-summary-report", "Booking Summary Report");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "confirmed":
        return "bg-blue-100 text-blue-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      case "no_show":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Booking Summary" },
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
          { label: "Booking Summary" },
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title="Booking Summary"
            subtitle="Analyze booking patterns and client behavior"
          />
          <SubscriptionGate
            feature="Booking Summary Reports"
            message="Basic reports require a subscription upgrade."
            upgradeMessage="Upgrade to Starter plan or higher to access booking analytics and insights."
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
          { label: "Booking Summary" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load booking summary data"}
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
        { label: "Booking Summary" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="booking-summary-report">
        <PageHeader
          title="Booking Summary"
          subtitle="Overview of all bookings and performance"
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

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <CardTitle className="text-sm font-medium text-gray-600">Average Booking Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averageBookingValue.toLocaleString()}
                </p>
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Daily Bookings Chart */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Daily Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {data.dailyBookings.length === 0 ? (
              <EmptyReportState title="No bookings found" description="No bookings in the selected period." />
            ) : (
              <RevenueChart
                data={data.dailyBookings.map((d) => ({
                  date: d.date,
                  revenue: d.revenue,
                  bookings: d.count,
                }))}
                type="bar"
              />
            )}
          </CardContent>
        </Card>

        {/* Status Breakdown */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {data.statusBreakdown.length === 0 ? (
              <EmptyReportState title="No status data" description="No status breakdown available." />
            ) : (
              <div className="space-y-3">
                {data.statusBreakdown.map((status) => (
                  <div
                    key={status.status}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(status.status)}`}>
                        {status.status}
                      </span>
                      <span className="text-sm text-gray-600">
                        {status.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{status.count} bookings</p>
                      <p className="text-sm text-gray-600">
                        ZAR {status.revenue.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Services */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Top Services</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topServices.length === 0 ? (
              <EmptyReportState title="No services found" description="No service data available." />
            ) : (
              <div className="space-y-3">
                {data.topServices.map((service, index) => (
                  <div
                    key={service.serviceName}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#FF0077] text-white font-semibold text-sm">
                        {index + 1}
                      </div>
                      <p className="font-medium text-gray-900">{service.serviceName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{service.bookings} bookings</p>
                      <p className="text-sm text-gray-600">
                        ZAR {service.revenue.toLocaleString()}
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
