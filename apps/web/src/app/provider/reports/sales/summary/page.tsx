"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { RevenueChart } from "../../components/RevenueChart";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { exportToCSV, exportToPDF, formatReportDataForExport } from "../../utils/export";

interface SalesSummaryData {
  totalRevenue: number;
  totalBookings: number;
  averageBookingValue: number;
  revenueGrowth: number;
  bookingsGrowth: number;
  revenueByDay: Array<{ date: string; revenue: number; bookings: number }>;
  revenueByService: Array<{ serviceName: string; revenue: number; bookings: number }>;
  revenueByStaff: Array<{ staffName: string; revenue: number; bookings: number }>;
}

export default function SalesSummaryReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<SalesSummaryData | null>(null);
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

      const response = await fetcher.get<{ data: SalesSummaryData }>(
        `/api/provider/reports/sales/summary?${params.toString()}`
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
      console.error("Error loading sales summary:", err);
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
      const exportData = formatReportDataForExport(data, "sales-summary");
      exportToCSV(exportData, "sales-summary-report");
    } else {
      exportToPDF("sales-summary-report", "sales-summary-report", "Sales Summary Report");
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Sales Summary" },
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
          { label: "Sales Summary" },
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title="Sales Summary"
            subtitle="Track revenue, bookings, and service performance"
          />
          <SubscriptionGate
            feature="Sales Summary Reports"
            message="Basic reports require a subscription upgrade."
            upgradeMessage="Upgrade to Starter plan or higher to access sales analytics and revenue tracking."
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
          { label: "Sales Summary" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load sales summary data"}
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
        { label: "Sales Summary" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="sales-summary-report">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Sales Summary"
            subtitle="Overview of your sales performance"
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
        />

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.totalRevenue.toLocaleString()}
                </p>
                <div className="flex items-center gap-1 text-sm">
                  {data.revenueGrowth >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600" />
                  )}
                  <span
                    className={
                      data.revenueGrowth >= 0 ? "text-green-600" : "text-red-600"
                    }
                  >
                    {Math.abs(data.revenueGrowth).toFixed(1)}%
                  </span>
                </div>
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
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.totalBookings}
                </p>
                <div className="flex items-center gap-1 text-sm">
                  {data.bookingsGrowth >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600" />
                  )}
                  <span
                    className={
                      data.bookingsGrowth >= 0 ? "text-green-600" : "text-red-600"
                    }
                  >
                    {Math.abs(data.bookingsGrowth).toFixed(1)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Average Booking Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                ZAR {data.averageBookingValue.toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Date Range
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                {dateRange.from && format(dateRange.from, "MMM dd, yyyy")}
                {dateRange.to && ` - ${format(dateRange.to, "MMM dd, yyyy")}`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue by Day Chart */}
        {data.revenueByDay.length > 0 && (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueChart data={data.revenueByDay} type="line" />
            </CardContent>
          </Card>
        )}

        {/* Revenue by Day Table */}
        {data.revenueByDay.length > 0 && (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Revenue by Day</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {data.revenueByDay.map((day, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {format(new Date(day.date), "MMM dd, yyyy")}
                      </p>
                      <p className="text-xs text-gray-600">
                        {day.bookings} booking{day.bookings !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      ZAR {day.revenue.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Revenue by Service */}
        {data.revenueByService && data.revenueByService.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Revenue by Service</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.revenueByService.map((service, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {service.serviceName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {service.bookings} booking{service.bookings !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      ZAR {service.revenue.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Revenue by Service</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                No service revenue data available for the selected period.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Revenue by Staff */}
        {data.revenueByStaff && data.revenueByStaff.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Revenue by Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.revenueByStaff.map((staff, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {staff.staffName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {staff.bookings} booking{staff.bookings !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      ZAR {staff.revenue.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Revenue by Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                No staff revenue data available for the selected period.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
