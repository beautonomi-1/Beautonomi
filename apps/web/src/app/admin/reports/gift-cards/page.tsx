"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Gift, DollarSign, TrendingUp, AlertCircle, Info } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
interface GiftCardMetrics {
  period: string;
  summary: {
    totalSales: number;
    totalSalesNet: number;
    totalRedemptions: number;
    totalOrders: number;
    totalRedemptionCount: number;
    outstandingLiability: number;
    totalIssued: number;
    redemptionRate: number;
    averageSaleValue: number;
    averageRedemptionValue: number;
  };
  trends: {
    salesByDay: Array<{ date: string; sales: number; count: number }>;
    redemptionsByDay: Array<{ date: string; redemptions: number; count: number }>;
  };
  accounting: {
    note: string;
    liability: number;
    recognizedRevenue: number;
  };
}

export default function GiftCardReportPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GiftCardMetrics | null>(null);
  const [period, setPeriod] = useState("30d");

  useEffect(() => {
    loadReport();
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps -- load when period changes

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: GiftCardMetrics }>(
        `/api/admin/gift-cards/metrics?period=${period}`
      );
      setData(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load gift card report";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      // Export logic can be added here
      toast.success("Export feature coming soon");
    } catch {
      toast.error("Failed to export report");
    }
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading gift card report..." />
        </div>
      </RoleGuard>
    );
  }

  if (error || !data) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Failed to load gift card report"
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
            <h1 className="text-3xl font-bold text-gray-900">Gift Card Report</h1>
            <p className="text-gray-600 mt-1">Gift card sales, redemptions, and liability tracking</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label>Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-32">
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
            <Button onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Accounting Note */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">Accounting Note</h3>
                <p className="text-sm text-blue-800">{data.accounting.note}</p>
                <p className="text-xs text-blue-700 mt-2">
                  <strong>Outstanding Liability:</strong> ZAR {data.accounting.liability.toLocaleString()} | 
                  <strong> Value Redeemed:</strong> ZAR {data.accounting.recognizedRevenue.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ZAR {data.summary.totalSales.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.summary.totalOrders} cards sold
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Redemptions</CardTitle>
              <Gift className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ZAR {data.summary.totalRedemptions.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.summary.totalRedemptionCount} redemptions
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Outstanding Liability</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ZAR {data.summary.outstandingLiability.toLocaleString()}
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
                {data.summary.redemptionRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Avg: ZAR {data.summary.averageRedemptionValue.toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Sale Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ZAR {data.summary.averageSaleValue.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Issued</CardTitle>
              <Gift className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ZAR {data.summary.totalIssued.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Sales</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ZAR {data.summary.totalSalesNet.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sales vs. Redemptions Trend */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Sales vs. Redemptions Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={data.trends.salesByDay.map((sale) => {
                  const redemption = data.trends.redemptionsByDay.find(
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
                <YAxis tickFormatter={(value) => `ZAR ${value.toLocaleString()}`} />
                <Tooltip
                  formatter={(value: number) => `ZAR ${value.toLocaleString()}`}
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

        {/* Sales Volume */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Gift Card Sales Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={data.trends.salesByDay.map((s) => ({
                  date: s.date,
                  count: s.count,
                  value: s.sales,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(new Date(value), "MMM d")}
                />
                <YAxis yAxisId="left" tickFormatter={(value) => value.toString()} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `ZAR ${value.toLocaleString()}`} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === "count") return value;
                    return `ZAR ${value.toLocaleString()}`;
                  }}
                  labelFormatter={(label) => format(new Date(label), "PP")}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="count" fill="#8884d8" name="Cards Sold" />
                <Bar yAxisId="right" dataKey="value" fill="#82ca9d" name="Sales Value" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
