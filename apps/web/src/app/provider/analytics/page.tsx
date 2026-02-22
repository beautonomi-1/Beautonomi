"use client";

import React, { useState, useEffect } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Calendar, Users, Package } from "lucide-react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface AnalyticsData {
  revenue: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    growth: string;
  };
  bookings: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    upcoming: number;
    growth: string;
  };
  customers: {
    total: number;
    repeat: number;
    new: number;
  };
  services: Array<{
    name: string;
    count: number;
    revenue: number;
  }>;
  trends: Array<{
    month: string;
    revenue: number;
    bookings: number;
  }>;
}

export default function ProviderAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"month" | "week" | "year">("month");

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: AnalyticsData }>(
        `/api/provider/analytics?period=${period}`,
        { timeoutMs: 30000 } // 30 second timeout
      );
      setAnalytics(response.data);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : "Failed to load analytics");
      console.error("Error loading analytics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Analytics" },
        ]}
      >
        <LoadingTimeout loadingMessage="Loading analytics..." />
      </SettingsDetailLayout>
    );
  }

  if (error || !analytics) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Analytics" },
        ]}
      >
        <div className="text-center py-8">
          <p className="text-red-600">{error || "Failed to load analytics"}</p>
        </div>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Analytics" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Analytics Dashboard"
          subtitle="Track your business performance and growth"
          actions={
            <div className="flex gap-2">
              <button
                onClick={() => setPeriod("week")}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  period === "week" 
                    ? "bg-[#FF0077] text-white" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setPeriod("month")}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  period === "month" 
                    ? "bg-[#FF0077] text-white" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setPeriod("year")}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  period === "year" 
                    ? "bg-[#FF0077] text-white" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Year
              </button>
            </div>
          }
        />

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(analytics.revenue.total)}</div>
              <p className="text-xs text-muted-foreground">
                This month: {formatCurrency(analytics.revenue.thisMonth)}
                {analytics.revenue.lastMonth > 0 && (
                  <span className="ml-2">• Last month: {formatCurrency(analytics.revenue.lastMonth)}</span>
                )}
              </p>
              <div className="flex items-center mt-2">
                {analytics.revenue.growth === "New" || (analytics.revenue.growth !== "0" && parseFloat(analytics.revenue.growth) >= 0) ? (
                  <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                ) : analytics.revenue.growth === "0" ? null : (
                  <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                )}
                <span className={`text-xs ${
                  analytics.revenue.growth === "New" || (analytics.revenue.growth !== "0" && parseFloat(analytics.revenue.growth) >= 0)
                    ? "text-green-600"
                    : analytics.revenue.growth === "0"
                    ? "text-gray-600"
                    : "text-red-600"
                }`}>
                  {analytics.revenue.growth === "New" 
                    ? "New revenue this month" 
                    : `${analytics.revenue.growth}% vs last month`}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.bookings.total}</div>
              <p className="text-xs text-muted-foreground">
                This month: {analytics.bookings.thisMonth} • Upcoming: {analytics.bookings.upcoming}
                {analytics.bookings.lastMonth > 0 && (
                  <span className="ml-2">• Last month: {analytics.bookings.lastMonth}</span>
                )}
              </p>
              <div className="flex items-center mt-2">
                {analytics.bookings.growth === "New" || (analytics.bookings.growth !== "0" && parseFloat(analytics.bookings.growth) >= 0) ? (
                  <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                ) : analytics.bookings.growth === "0" ? null : (
                  <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                )}
                <span className={`text-xs ${
                  analytics.bookings.growth === "New" || (analytics.bookings.growth !== "0" && parseFloat(analytics.bookings.growth) >= 0)
                    ? "text-green-600"
                    : analytics.bookings.growth === "0"
                    ? "text-gray-600"
                    : "text-red-600"
                }`}>
                  {analytics.bookings.growth === "New" 
                    ? "New bookings this month" 
                    : `${analytics.bookings.growth}% vs last month`}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.customers.total}</div>
              <p className="text-xs text-muted-foreground">
                Repeat: {analytics.customers.repeat} • New: {analytics.customers.new}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Services</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.services.length}</div>
              <p className="text-xs text-muted-foreground">
                {analytics.services[0]?.name || "N/A"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Trends Chart */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Revenue Trends (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#FF0077" strokeWidth={2} name="Revenue" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bookings Trends Chart */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Booking Trends (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="bookings" fill="#FF0077" name="Bookings" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Services */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.services.slice(0, 10).map((service, index) => (
                <div key={index} className="flex justify-between items-center p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{service.name}</p>
                    <p className="text-sm text-gray-600">{service.count} bookings</p>
                  </div>
                  <p className="font-semibold">{formatCurrency(service.revenue)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
