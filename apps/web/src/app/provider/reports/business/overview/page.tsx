"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, DollarSign, Calendar, Users, TrendingUp, TrendingDown, CheckCircle, XCircle } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface BusinessOverviewData {
  period: string;
  totalRevenue: number;
  netRevenue: number;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  noShows: number;
  uniqueClients: number;
  totalStaff: number;
  totalPayments: number;
  successfulPayments: number;
  totalRefunded: number;
  averageBookingValue: number;
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
  revenueGrowth: number;
}

export default function BusinessOverviewReport() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<BusinessOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadReport();
  }, [period]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append("period", period);

      const response = await fetcher.get<{ data: BusinessOverviewData }>(
        `/api/provider/reports/business/overview?${params.toString()}`
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
      console.error("Error loading business overview:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data, "business-overview");
    exportToCSV(exportData, "business-overview-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Business Overview" },
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
          { label: "Business Overview" },
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title="Business Overview"
            subtitle="Overall business performance and insights"
          />
          <SubscriptionGate
            feature="Business Overview Reports"
            message="Reports require a subscription upgrade."
            upgradeMessage="Upgrade to Starter plan or higher to access comprehensive business analytics and insights."
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
          { label: "Business Overview" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load business overview data"}
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
        { label: "Business Overview" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Business Overview"
          subtitle="Comprehensive view of your business performance"
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
              <SelectItem value="month">Last Month</SelectItem>
              <SelectItem value="quarter">Last Quarter</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-semibold text-gray-900">
                    ZAR {data.totalRevenue.toLocaleString()}
                  </p>
                  {data.revenueGrowth !== 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      {data.revenueGrowth >= 0 ? (
                        <TrendingUp className="w-4 h-4 text-green-600" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      )}
                      <p className={`text-xs ${data.revenueGrowth >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {data.revenueGrowth >= 0 ? "+" : ""}{data.revenueGrowth.toFixed(1)}%
                      </p>
                    </div>
                  )}
                </div>
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
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Unique Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.uniqueClients}</p>
                <Users className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Booking Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averageBookingValue.toLocaleString()}
                </p>
                <TrendingUp className="w-5 h-5 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Completion Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.completionRate.toFixed(1)}%
                </p>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-xs text-gray-500 mt-1">{data.completedBookings} completed</p>
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
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-xs text-gray-500 mt-1">{data.cancelledBookings} cancelled</p>
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
                <XCircle className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-xs text-gray-500 mt-1">{data.noShows} no-shows</p>
            </CardContent>
          </Card>
        </div>

        {/* Financial Summary */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Net Revenue</p>
                <p className="text-xl font-semibold text-gray-900">
                  ZAR {data.netRevenue.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Total Refunded</p>
                <p className="text-xl font-semibold text-red-600">
                  ZAR {data.totalRefunded.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Successful Payments</p>
                <p className="text-xl font-semibold text-green-600">
                  {data.successfulPayments} / {data.totalPayments}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
