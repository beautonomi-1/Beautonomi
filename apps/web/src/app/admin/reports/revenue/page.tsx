"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Calendar, DollarSign, TrendingUp, Gift } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";

interface RevenueReportData {
  period: string;
  totalRevenue: number;
  revenueByDay: Array<{ date: string; revenue: number; bookings: number }>;
  revenueByProvider: Array<{ provider_id: string; provider_name: string; revenue: number; bookings: number }>;
  revenueByService: Array<{ service_id: string; service_name: string; revenue: number; bookings: number }>;
  revenueByStatus: Array<{ status: string; revenue: number; bookings: number }>;
  giftCardMetrics?: {
    totalSales: number;
    totalRedemptions: number;
    outstandingLiability: number;
    redemptionRate: number;
    salesByDay: Array<{ date: string; sales: number; count: number }>;
    redemptionsByDay: Array<{ date: string; redemptions: number; count: number }>;
  };
}

export default function RevenueReportPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RevenueReportData | null>(null);
  const [period, setPeriod] = useState("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    loadReport();
  }, [period, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps -- load when params change

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("period", period);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const response = await fetcher.get<{ data: RevenueReportData }>(
        `/api/admin/reports/revenue?${params.toString()}`
      );
      const reportData = (response as any).data || response;
      setData(reportData);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load revenue report";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      params.set("period", period);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const response = await fetch(`/api/admin/export/analytics?period=${period}&report_type=revenue`);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `revenue-report-${period}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Export downloaded");
    } catch {
      toast.error("Failed to export report");
    }
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading revenue report..." />
        </div>
      </RoleGuard>
    );
  }

  if (error || !data) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Failed to load revenue report"
            description={error || "Unable to load report data"}
            action={{
              label: "Retry",
              onClick: loadReport,
            }}
          />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Revenue Report</h1>
            <p className="text-gray-600 mt-1">Platform revenue analysis and trends</p>
          </div>
          <Button onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Period</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                    <SelectItem value="1y">Last year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="w-full"
                >
                  Clear Dates
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R {data.totalRevenue.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.revenueByDay.reduce((sum, day) => sum + day.bookings, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Booking Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R {(data.totalRevenue / Math.max(1, data.revenueByDay.reduce((sum, day) => sum + day.bookings, 0))).toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Over Time */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Revenue Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(new Date(value), "MMM d")}
                />
                <YAxis tickFormatter={(value) => `R ${value.toLocaleString()}`} />
                <Tooltip
                  formatter={(value: number) => `R ${value.toLocaleString()}`}
                  labelFormatter={(label) => format(new Date(label), "PP")}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0088FE"
                  strokeWidth={2}
                  name="Revenue"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue by Provider */}
        {data.revenueByProvider.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Revenue by Provider</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.revenueByProvider.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="provider_name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis tickFormatter={(value) => `R ${value.toLocaleString()}`} />
                  <Tooltip formatter={(value: number) => `R ${value.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#00C49F" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Revenue by Status */}
        {data.revenueByStatus.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Revenue by Booking Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.revenueByStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" />
                  <YAxis tickFormatter={(value) => `R ${value.toLocaleString()}`} />
                  <Tooltip formatter={(value: number) => `R ${value.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#FFBB28" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Gift Card Metrics Section */}
        {data.giftCardMetrics && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Gift Card Sales</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    R {data.giftCardMetrics.totalSales.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Cash received (liability)</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Gift Card Redemptions</CardTitle>
                  <Gift className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    R {data.giftCardMetrics.totalRedemptions.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Value redeemed</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Outstanding Liability</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    R {data.giftCardMetrics.outstandingLiability.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Unredeemed balance</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Redemption Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data.giftCardMetrics.redemptionRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Cards redeemed</p>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Gift Card Sales vs. Redemptions</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={data.giftCardMetrics.salesByDay.map((sale) => {
                      const redemption = data.giftCardMetrics!.redemptionsByDay.find(
                        (r) => r.date === sale.date
                      );
                      return {
                        date: sale.date,
                        sales: sale.sales,
                        redemptions: redemption?.redemptions || 0,
                      };
                    })}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => format(new Date(value), "MMM d")}
                    />
                    <YAxis tickFormatter={(value) => `R ${value.toLocaleString()}`} />
                    <Tooltip
                      formatter={(value: number) => `R ${value.toLocaleString()}`}
                      labelFormatter={(label) => format(new Date(label), "PP")}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke="#00C49F"
                      strokeWidth={2}
                      name="Sales"
                    />
                    <Line
                      type="monotone"
                      dataKey="redemptions"
                      stroke="#FF0077"
                      strokeWidth={2}
                      name="Redemptions"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </RoleGuard>
  );
}
