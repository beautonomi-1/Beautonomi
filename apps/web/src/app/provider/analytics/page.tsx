"use client";

import React, { useState, useEffect } from "react";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Wallet, Calendar, Users, Package, Info } from "lucide-react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

interface AnalyticsData {
  period?: string;
  timezone?: string;
  windows?: {
    current: { fromYmd: string; toYmd: string };
    previous: { fromYmd: string; toYmd: string };
  };
  basis?: Record<string, string>;
  trends_meta?: { bucket: string; buckets_count: number; description: string };
  revenue: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    growth: string;
    all_time?: number;
    current_period?: number;
    previous_period?: number;
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
    single_booking?: number;
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
  const locale = useTenantLocaleTag();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const { selectedLocationId } = useProviderPortal();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"month" | "week" | "year">("month");

  useEffect(() => {
    void loadAnalytics();
  }, [period, selectedLocationId]);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({ period });
      if (selectedLocationId) params.append("location_id", selectedLocationId);
      const response = await fetcher.get<{ data: AnalyticsData }>(`/api/provider/analytics?${params.toString()}`, {
        timeoutMs: 30000,
      });
      setAnalytics(response.data);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : "Failed to load analytics");
      console.error("Error loading analytics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: tenantCurrency,
    }).format(amount);
  };

  const periodLabels =
    period === "week"
      ? {
          current: "This week",
          previous: "Last week",
          ledgerTitle: "Ledger net by week",
          bookingsTitle: "Bookings created by week",
          bucketHint: "last 12 weeks",
        }
      : period === "year"
        ? {
            current: "This year",
            previous: "Last year",
            ledgerTitle: "Ledger net by year",
            bookingsTitle: "Bookings created by year",
            bucketHint: "last 5 years",
          }
        : {
            current: "This month",
            previous: "Last month",
            ledgerTitle: "Ledger net by month",
            bookingsTitle: "Bookings created by month",
            bucketHint: "last 12 months",
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
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <p className="text-sm text-red-600">{error || "Failed to load analytics"}</p>
          <button
            type="button"
            onClick={() => void loadAnalytics()}
            className="min-h-[44px] touch-manipulation rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
          >
            Try Again
          </button>
        </div>
      </SettingsDetailLayout>
    );
  }

  const rev = analytics.revenue;
  const periodLedger = rev.current_period ?? rev.thisMonth;
  const priorLedger = rev.previous_period ?? rev.lastMonth;
  const allTimeLedger = rev.all_time ?? rev.total;
  const singleBooking = analytics.customers.single_booking ?? analytics.customers.new;
  const win = analytics.windows;
  const tzLabel = analytics.timezone?.replace(/_/g, " ");
  const rangeLine =
    win?.current?.fromYmd && win?.current?.toYmd
      ? `${win.current.fromYmd} → ${win.current.toYmd}${tzLabel ? ` · ${tzLabel}` : ""}`
      : null;

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Analytics" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="provider-analytics">
        <PageHeader
          title="Analytics"
          subtitle="Ledger net, booking counts, and catalog-based service totals — definitions differ; see facts below"
          actions={
            <div className="flex flex-wrap gap-2">
              {(["week", "month", "year"] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={period === p ? "default" : "outline"}
                  size="sm"
                  className="min-h-[44px] min-w-[72px] touch-manipulation"
                  onClick={() => setPeriod(p)}
                >
                  {p === "week" ? "Week" : p === "year" ? "Year" : "Month"}
                </Button>
              ))}
            </div>
          }
        />

        {rangeLine ? <p className="text-xs text-gray-500">{rangeLine}</p> : null}
        {selectedLocationId ? (
          <p className="text-xs text-gray-500">Filtered to the selected location.</p>
        ) : (
          <p className="text-xs text-gray-500">All locations combined.</p>
        )}

        {analytics.basis && Object.keys(analytics.basis).length > 0 ? (
          <div className="flex gap-3 rounded-xl border border-indigo-200/90 bg-indigo-50/95 px-4 py-3 text-sm leading-relaxed text-indigo-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" aria-hidden />
            <div className="space-y-2">
              <p className="font-medium text-indigo-900">Facts & definitions</p>
              <ul className="list-inside list-disc space-y-1 text-xs text-indigo-950/95 md:list-outside md:pl-2">
                {Object.entries(analytics.basis).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium capitalize">{k.replace(/_/g, " ")}: </span>
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="mb-2 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-gray-700">Ledger net (this period)</CardTitle>
                <CardDescription className="text-xs">provider_earnings · settlement timestamp</CardDescription>
              </div>
              <Wallet className="h-4 w-4 shrink-0 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
                {formatCurrency(periodLedger)}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {periodLabels.previous}: {formatCurrency(priorLedger)}
              </p>
              <div className="mt-2 flex items-center">
                {analytics.revenue.growth === "New" ||
                (analytics.revenue.growth !== "0" && parseFloat(analytics.revenue.growth) >= 0) ? (
                  <TrendingUp className="mr-1 h-4 w-4 shrink-0 text-emerald-600" />
                ) : analytics.revenue.growth === "0" ? null : (
                  <TrendingDown className="mr-1 h-4 w-4 shrink-0 text-red-600" />
                )}
                <span
                  className={`text-xs ${
                    analytics.revenue.growth === "New" ||
                    (analytics.revenue.growth !== "0" && parseFloat(analytics.revenue.growth) >= 0)
                      ? "text-emerald-700"
                      : analytics.revenue.growth === "0"
                        ? "text-gray-600"
                        : "text-red-700"
                  }`}
                >
                  {analytics.revenue.growth === "New"
                    ? `First ${periodLabels.current.toLowerCase()} with ledger activity`
                    : `${analytics.revenue.growth}% vs ${periodLabels.previous.toLowerCase()}`}
                </span>
              </div>
              <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
                All-time ledger net: <span className="font-medium text-gray-800">{formatCurrency(allTimeLedger)}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-gray-700">Bookings (period)</CardTitle>
                <CardDescription className="text-xs">Created in window · not appointment date</CardDescription>
              </div>
              <Calendar className="h-4 w-4 shrink-0 text-teal-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{analytics.bookings.thisMonth}</div>
              <p className="mt-1 text-xs text-gray-500">
                Upcoming confirmed: {analytics.bookings.upcoming}
                {analytics.bookings.lastMonth > 0 ? (
                  <span className="ml-2">
                    • {periodLabels.previous}: {analytics.bookings.lastMonth}
                  </span>
                ) : null}
              </p>
              <div className="mt-2 flex items-center">
                {analytics.bookings.growth === "New" ||
                (analytics.bookings.growth !== "0" && parseFloat(analytics.bookings.growth) >= 0) ? (
                  <TrendingUp className="mr-1 h-4 w-4 shrink-0 text-emerald-600" />
                ) : analytics.bookings.growth === "0" ? null : (
                  <TrendingDown className="mr-1 h-4 w-4 shrink-0 text-red-600" />
                )}
                <span
                  className={`text-xs ${
                    analytics.bookings.growth === "New" ||
                    (analytics.bookings.growth !== "0" && parseFloat(analytics.bookings.growth) >= 0)
                      ? "text-emerald-700"
                      : analytics.bookings.growth === "0"
                        ? "text-gray-600"
                        : "text-red-700"
                  }`}
                >
                  {analytics.bookings.growth === "New"
                    ? `First ${periodLabels.current.toLowerCase()} with bookings`
                    : `${analytics.bookings.growth}% vs ${periodLabels.previous.toLowerCase()}`}
                </span>
              </div>
              <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
                All-time booking rows:{" "}
                <span className="font-medium text-gray-800">{analytics.bookings.total}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-gray-700">Customers</CardTitle>
                <CardDescription className="text-xs">Distinct clients in your bookings</CardDescription>
              </div>
              <Users className="h-4 w-4 shrink-0 text-sky-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{analytics.customers.total}</div>
              <p className="mt-1 text-xs text-gray-500">
                Repeat (2+ bookings): {analytics.customers.repeat} · Single-booking: {singleBooking}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-gray-700">Top offerings</CardTitle>
                <CardDescription className="text-xs">By catalog line totals · not ledger</CardDescription>
              </div>
              <Package className="h-4 w-4 shrink-0 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{analytics.services.length}</div>
              <p className="mt-1 text-xs text-gray-500">
                Leading: {analytics.services[0]?.name || "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>
              {periodLabels.ledgerTitle} ({periodLabels.bucketHint})
            </CardTitle>
            <CardDescription>
              {analytics.trends_meta?.description ?? "Ledger net per bucket matches headline revenue rules."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} name="Ledger net" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>
              {periodLabels.bookingsTitle} ({periodLabels.bucketHint})
            </CardTitle>
            <CardDescription>Counts when the booking record was created — same buckets as the line chart.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="bookings" fill="var(--primary)" name="Bookings created" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Ranked offerings</CardTitle>
            <CardDescription>
              Sum of booking line prices per service for bookings ever created — catalog totals; use ledger reports for settlement
              economics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.services.slice(0, 10).map((service, index) => (
                <div
                  key={`${service.name}-${index}`}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">{service.name}</p>
                    <p className="text-sm text-gray-600">{service.count} bookings · line total</p>
                  </div>
                  <p className="font-semibold tabular-nums text-gray-900">{formatCurrency(service.revenue)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
