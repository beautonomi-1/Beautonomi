"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Users, Calendar, DollarSign, Download } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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
import { format } from "date-fns";

const CURRENCY_CODE = "R";
const formatCurrency = (value: number) =>
  `${CURRENCY_CODE} ${(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatGrowth = (growth: number | undefined | null) => {
  if (growth == null || (typeof growth === "number" && Number.isNaN(growth))) return "No growth data";
  if (growth > 0) return `+${growth}% growth`;
  if (growth < 0) return `${growth}% growth`;
  return "No change";
};

interface TimeSeriesData {
  date: string;
  count?: number;
  revenue?: number;
}

interface AnalyticsData {
  period: string;
  timeSeries: {
    users: TimeSeriesData[];
    providers: TimeSeriesData[];
    bookings: TimeSeriesData[];
    revenue: TimeSeriesData[];
  };
  breakdowns: {
    providerStatus: {
      active: number;
      pending: number;
      suspended: number;
      rejected: number;
    };
    bookingStatus: {
      confirmed: number;
      completed: number;
      cancelled: number;
      no_show: number;
    };
  };
  topProviders: Array<{
    provider_id: string;
    business_name: string;
    revenue: number;
  }>;
}

export default function AdminAnalytics() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState("30d");

  useEffect(() => {
    loadAnalytics();
    loadDetailedAnalytics();
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps -- load when period changes

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch dashboard stats which includes analytics data
      const response = await fetcher.get<{ data: any }>("/api/admin/dashboard");
      setStats(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load analytics";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetailedAnalytics = async () => {
    try {
      setIsLoadingAnalytics(true);
      const response = await fetcher.get<{ data: AnalyticsData }>(
        `/api/admin/analytics?period=${period}`
      );
      // Handle response format - fetcher may unwrap or return nested data
      const analyticsData = (response as any).data || response;
      setAnalyticsData(analyticsData);
    } catch (err) {
      console.error("Error loading detailed analytics:", err);
      toast.error("Failed to load detailed analytics");
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading analytics..." />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load analytics"
          description={error || "Unable to load analytics data"}
          action={{
            label: "Retry",
            onClick: loadAnalytics,
          }}
        />
      </div>
    );
  }

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM d");
    } catch {
      return dateStr;
    }
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics & Reports</h1>
            <p className="text-gray-600 mt-1">Platform analytics and business intelligence</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/admin/export/analytics?period=${period}`);
                    if (!response.ok) throw new Error("Export failed");
                    
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `analytics-export-${period}-${new Date().toISOString().split("T")[0]}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    toast.success("Export downloaded");
                  } catch {
                    toast.error("Failed to export analytics");
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_users ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {formatGrowth(stats.users_growth)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_providers ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {formatGrowth(stats.providers_growth)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_bookings ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {formatGrowth(stats.bookings_growth)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats.total_revenue ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatGrowth(stats.revenue_growth)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">GMV Total</span>
                <span className="font-semibold">{formatCurrency(stats.gmv_total ?? 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Platform Net Total</span>
                <span className="font-semibold">
                  {formatCurrency(stats.platform_net_total ?? 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Platform Commission (Gross)</span>
                <span className="font-semibold">
                  {formatCurrency(stats.platform_commission_gross_total ?? 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Gateway Fees</span>
                <span className="font-semibold">
                  {formatCurrency(stats.gateway_fees_total ?? 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Refunds Total</span>
                <span className="font-semibold text-red-600">
                  {formatCurrency(stats.refunds_total ?? 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Active Bookings</span>
                  <span className="font-semibold">{stats.active_bookings_today ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Revenue Today</span>
                  <span className="font-semibold">
                    {formatCurrency(stats.revenue_today ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Pending Approvals</span>
                  <span className="font-semibold">{stats.pending_approvals ?? 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Revenue This Month</span>
                  <span className="font-semibold">
                    {formatCurrency(stats.revenue_this_month ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Subscription Net</span>
                  <span className="font-semibold">
                    {formatCurrency(stats.subscription_net_total ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Gift Card Sales</span>
                  <span className="font-semibold">
                    {formatCurrency(stats.gift_card_sales_total ?? 0)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Time Series Charts */}
        {isLoadingAnalytics ? (
          <Card>
            <CardContent className="p-6">
              <LoadingTimeout loadingMessage="Loading charts..." />
            </CardContent>
          </Card>
        ) : analyticsData ? (
          <>
            {/* Revenue Time Series */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analyticsData.timeSeries?.revenue ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tickFormatter={(value) => formatCurrency(Number(value))} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(Number(value))}
                      labelFormatter={formatDate}
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

            {/* Growth Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>User Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={analyticsData.timeSeries?.users ?? []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis />
                      <Tooltip labelFormatter={formatDate} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#00C49F"
                        strokeWidth={2}
                        name="New Users"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Provider Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={analyticsData.timeSeries?.providers ?? []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis />
                      <Tooltip labelFormatter={formatDate} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#FFBB28"
                        strokeWidth={2}
                        name="New Providers"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Bookings Time Series */}
            <Card>
              <CardHeader>
                <CardTitle>Bookings Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analyticsData.timeSeries?.bookings ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip labelFormatter={formatDate} />
                    <Legend />
                    <Bar dataKey="count" fill="#8884d8" name="Bookings" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Breakdown Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Provider Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Active", value: analyticsData.breakdowns?.providerStatus?.active ?? 0 },
                          { name: "Pending", value: analyticsData.breakdowns?.providerStatus?.pending ?? 0 },
                          { name: "Suspended", value: analyticsData.breakdowns?.providerStatus?.suspended ?? 0 },
                          { name: "Rejected", value: analyticsData.breakdowns?.providerStatus?.rejected ?? 0 },
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {[
                          analyticsData.breakdowns?.providerStatus?.active ?? 0,
                          analyticsData.breakdowns?.providerStatus?.pending ?? 0,
                          analyticsData.breakdowns?.providerStatus?.suspended ?? 0,
                          analyticsData.breakdowns?.providerStatus?.rejected ?? 0,
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Booking Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Completed", value: analyticsData.breakdowns?.bookingStatus?.completed ?? 0 },
                          { name: "Confirmed", value: analyticsData.breakdowns?.bookingStatus?.confirmed ?? 0 },
                          { name: "Cancelled", value: analyticsData.breakdowns?.bookingStatus?.cancelled ?? 0 },
                          { name: "No Show", value: analyticsData.breakdowns?.bookingStatus?.no_show ?? 0 },
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {[
                          analyticsData.breakdowns?.bookingStatus?.completed ?? 0,
                          analyticsData.breakdowns?.bookingStatus?.confirmed ?? 0,
                          analyticsData.breakdowns?.bookingStatus?.cancelled ?? 0,
                          analyticsData.breakdowns?.bookingStatus?.no_show ?? 0,
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Top Providers */}
            {(analyticsData.topProviders?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Top Providers by Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={analyticsData.topProviders ?? []}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(value) => formatCurrency(Number(value))} />
                      <YAxis
                        dataKey="business_name"
                        type="category"
                        width={90}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                      <Legend />
                      <Bar dataKey="revenue" fill="#0088FE" name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </RoleGuard>
  );
}
