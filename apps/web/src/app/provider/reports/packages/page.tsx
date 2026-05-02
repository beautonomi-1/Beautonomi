"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Package, TrendingUp, Users, BarChart3 } from "lucide-react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetcher } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../components/ReportSkeleton";
import { EmptyReportState } from "../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { exportToCSV } from "../utils/export";

type Period = "all" | "month" | "quarter" | "year";

type PackageOverviewRow = {
  id: string;
  name: string;
  total_sold: number;
  total_revenue: number;
  active_count: number;
  usage_rate: number | null;
  avg_completion_days: number | null;
  services_included: number;
};

type PackageOverviewData = {
  stats: {
    total_packages: number;
    total_sold: number;
    total_revenue: number;
    active_subscriptions: number | null;
    avg_usage_rate: number | null;
  };
  packages: PackageOverviewRow[];
};

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

export default function PackageOverviewReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode, format: formatMoney } = useReportCurrency();
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<PackageOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const params = new URLSearchParams({ period });
        appendLocation(params);
        const res = await fetcher.get<{ data: PackageOverviewData }>(
          `/api/provider/reports/packages?${params.toString()}`,
        );
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load packages overview");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [period, selectedLocationId]);

  const rows = useMemo(() => data?.packages ?? [], [data]);

  const handleExport = () => {
    if (!data) return;
    exportToCSV(
      rows.map((pkg) => ({
        Package: pkg.name,
        Sold: pkg.total_sold,
        Revenue: pkg.total_revenue,
        Active: pkg.active_count,
        "Usage rate": pkg.usage_rate == null ? "—" : `${pkg.usage_rate}%`,
        "Services/products included": pkg.services_included,
      })),
      `packages-overview-${period}`,
    );
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Packages Overview" },
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
          { label: "Packages Overview" },
        ]}
      >
        <EmptyReportState title="Failed to load report" description={error || "Unable to load package overview data"} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Packages Overview" },
      ]}
    >
      <PageHeader
        title="Packages Overview"
        subtitle="Catalog package performance, sold count, revenue, and active package context"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/provider/reports/packages/sales">
              <Button variant="outline">Package sales</Button>
            </Link>
            <Link href="/provider/reports/packages/usage">
              <Button variant="outline">Package usage</Button>
            </Link>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {PERIODS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={period === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total sold</CardTitle>
            <Package className="h-4 w-4 text-cyan-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.total_sold}</div>
            <p className="text-xs text-muted-foreground">{data.stats.total_packages} active catalog packages</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(data.stats.total_revenue)}</div>
            <p className="text-xs text-muted-foreground">Package value booked in {period === "all" ? "all time" : `this ${period}`}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.stats.active_subscriptions == null ? "—" : data.stats.active_subscriptions}
            </div>
            <p className="text-xs text-muted-foreground">Active subscription metric where package credits are available</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Package catalog performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyReportState
              title="No packages found"
              description="Create catalog packages to see sales, revenue, and usage context here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">Package</th>
                    <th className="pb-3 font-medium">Included</th>
                    <th className="pb-3 text-right font-medium">Sold</th>
                    <th className="pb-3 text-right font-medium">Revenue</th>
                    <th className="pb-3 text-right font-medium">Active</th>
                    <th className="pb-3 text-right font-medium">Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((pkg) => (
                    <tr key={pkg.id} className="border-b last:border-0">
                      <td className="py-4">
                        <div className="font-medium">{pkg.name}</div>
                        <div className="text-xs text-muted-foreground">{pkg.id}</div>
                      </td>
                      <td className="py-4">
                        <Badge variant="secondary">
                          {pkg.services_included} item{pkg.services_included === 1 ? "" : "s"}
                        </Badge>
                      </td>
                      <td className="py-4 text-right">{pkg.total_sold}</td>
                      <td className="py-4 text-right">{formatMoney(pkg.total_revenue)}</td>
                      <td className="py-4 text-right">{pkg.active_count}</td>
                      <td className="py-4 text-right">
                        {pkg.usage_rate == null ? "—" : `${pkg.usage_rate.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Currency: {currencyCode}. Overview uses the same aggregate API as the provider app; use Sales and Usage for date-range drill-downs.
          </p>
        </CardContent>
      </Card>
    </SettingsDetailLayout>
  );
}
