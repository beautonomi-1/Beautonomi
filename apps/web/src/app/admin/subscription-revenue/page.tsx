"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DollarSign,
  TrendingDown,
  Users,
  CreditCard,
  Download,
  RefreshCw,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import Link from "next/link";

interface SubscriptionMetrics {
  mrr: number;
  arr: number;
  total_subscriptions: number;
  active_subscriptions: number;
  status_breakdown: {
    active: number;
    trialing: number;
    cancelled: number;
    past_due: number;
    inactive: number;
  };
  billing_breakdown: {
    monthly: number;
    yearly: number;
  };
  revenue_by_plan: Array<{
    plan_name: string;
    count: number;
    mrr: number;
  }>;
  churn_rate: number;
  arpu: number;
  new_this_month: number;
  cancelled_this_month: number;
  revenue_trends: Array<{
    month: string;
    revenue: number;
    label: string;
  }>;
  top_providers: Array<{
    provider_id: string;
    business_name: string;
    revenue: number;
  }>;
}

export default function SubscriptionRevenuePage() {
  const [metrics, setMetrics] = useState<SubscriptionMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    loadMetrics();
  }, [startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps -- load when date range changes

  const loadMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const response = await fetcher.get<{ data: SubscriptionMetrics }>(
        `/api/admin/subscription-metrics?${params.toString()}`
      );
      setMetrics(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load subscription metrics";
      setError(errorMessage);
      console.error("Error loading metrics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `ZAR ${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading subscription metrics..." />
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load subscription revenue"
          description={error || "Unable to load subscription revenue data"}
          action={{
            label: "Retry",
            onClick: loadMetrics,
          }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6" data-page="subscription-revenue">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Subscription Revenue & Metrics</h1>
            <p className="text-gray-600 mt-1">
              Comprehensive view of provider subscription revenue and key metrics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadMetrics}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Date Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Recurring Revenue (MRR)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.mrr)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Annual: {formatCurrency(metrics.arr)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.active_subscriptions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Total: {metrics.total_subscriptions}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Revenue Per User (ARPU)</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.arpu)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Per month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercentage(metrics.churn_rate)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                This month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Status and Billing Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Subscription Status</CardTitle>
              <CardDescription>Breakdown by status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                  <span className="font-semibold">{metrics.status_breakdown.active}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800">Trialing</Badge>
                  </div>
                  <span className="font-semibold">{metrics.status_breakdown.trialing}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-gray-100 text-gray-800">Cancelled</Badge>
                  </div>
                  <span className="font-semibold">{metrics.status_breakdown.cancelled}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-red-100 text-red-800">Past Due</Badge>
                  </div>
                  <span className="font-semibold">{metrics.status_breakdown.past_due}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Inactive</Badge>
                  </div>
                  <span className="font-semibold">{metrics.status_breakdown.inactive}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing Period</CardTitle>
              <CardDescription>Monthly vs Yearly subscriptions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Monthly</span>
                  <span className="font-semibold">{metrics.billing_breakdown.monthly}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Yearly</span>
                  <span className="font-semibold">{metrics.billing_breakdown.yearly}</span>
                </div>
                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Total</span>
                    <span className="font-bold text-lg">
                      {metrics.billing_breakdown.monthly + metrics.billing_breakdown.yearly}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue by Plan */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Plan</CardTitle>
            <CardDescription>MRR breakdown by subscription plan</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.revenue_by_plan.length === 0 ? (
              <EmptyState
                title="No plan revenue data"
                description="No active subscriptions found"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan Name</TableHead>
                    <TableHead>Subscriptions</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.revenue_by_plan.map((plan, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{plan.plan_name}</TableCell>
                      <TableCell>{plan.count}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(plan.mrr)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Top Providers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Providers by Subscription Revenue</CardTitle>
            <CardDescription>Providers contributing the most to MRR</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.top_providers.length === 0 ? (
              <EmptyState
                title="No provider data"
                description="No active subscriptions found"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Monthly Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.top_providers.map((provider, index) => (
                    <TableRow key={provider.provider_id}>
                      <TableCell>#{index + 1}</TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/providers/${provider.provider_id}`}
                          className="text-[#FF0077] hover:underline font-medium"
                        >
                          {provider.business_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(provider.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Monthly Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Activity</CardTitle>
            <CardDescription>New and cancelled subscriptions this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">
                  {metrics.new_this_month}
                </div>
                <div className="text-sm text-gray-600 mt-1">New Subscriptions</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-3xl font-bold text-red-600">
                  {metrics.cancelled_this_month}
                </div>
                <div className="text-sm text-gray-600 mt-1">Cancelled This Month</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trends (Last 12 Months)</CardTitle>
            <CardDescription>MRR over time</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.revenue_trends.length === 0 ? (
              <EmptyState
                title="No trend data"
                description="No historical data available"
              />
            ) : (
              <div className="space-y-2">
                {metrics.revenue_trends.map((trend) => (
                  <div key={trend.month} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                    <span className="text-sm font-medium">{trend.label}</span>
                    <span className="font-semibold">{formatCurrency(trend.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
