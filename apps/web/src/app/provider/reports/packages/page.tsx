"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Package, TrendingUp, Layers, BarChart3 } from "lucide-react";
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
  services_included: number;
};

type PackageOverviewData = {
  timezone?: string;
  period?: string;
  fromYmd?: string;
  toYmd?: string;
  reportBasis?: string;
  basis?: Record<string, string>;
  stats: {
    total_packages: number;
    total_sold: number;
    total_revenue: number;
  };
  packages: PackageOverviewRow[];
};

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];

const BASIS_LABELS: Record<string, string> = {
  catalog: "Catalog",
  aggregates: "Totals",
  revenue: "Value",
};

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

  const basisEntries = data?.basis
    ? (Object.entries(data.basis) as [string, string][]).filter(([, v]) => v?.trim())
    : [];

  const handleExport = () => {
    if (!data) return;
    exportToCSV(
      rows.map((pkg) => ({
        Package: pkg.name,
        Bookings: pkg.total_sold,
        Revenue: pkg.total_revenue,
        "Services in bundle": pkg.services_included,
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
          { label: "Packages overview" },
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
          { label: "Packages overview" },
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
        { label: "Packages overview" },
      ]}
    >
      <PageHeader
        title="Packages overview"
        subtitle="Active catalog bundles with booked counts and package line value in the selected period — same revenue rules as Package sales."
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

      {data.reportBasis ? (
        <div className="mb-6 rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
          <p className="font-medium text-sky-950">What this report counts</p>
          <p className="mt-1 text-sky-950/95">{data.reportBasis}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-900/85">
            {data.timezone ? <span>Timezone · {data.timezone}</span> : null}
            {data.fromYmd && data.toYmd ? (
              <span>
                Window · {data.fromYmd} – {data.toYmd}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {basisEntries.length > 0 ? (
        <Card className="mb-6 border-violet-100 bg-violet-50/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-violet-950">Definitions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-violet-950/95">
            {basisEntries.map(([k, v]) => (
              <p key={k}>
                <span className="font-medium">{BASIS_LABELS[k] ?? k} · </span>
                {v}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Catalog packages</CardTitle>
            <Layers className="h-4 w-4 text-cyan-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{data.stats.total_packages}</div>
            <p className="text-xs text-muted-foreground leading-snug">Active service_packages definitions</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Bookings in window</CardTitle>
            <Package className="h-4 w-4 text-cyan-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{data.stats.total_sold}</div>
            <p className="text-xs text-muted-foreground leading-snug">
              Qualifying package bookings + group events (scheduled_at in period)
            </p>
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Booked package value</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatMoney(data.stats.total_revenue)}</div>
            <p className="text-xs text-muted-foreground leading-snug">packageReportBookedValue — excludes arbitrary booking.total_amount padding</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5" />
            By catalog package
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground mt-1">
            Every active bundle is listed; zeros mean no matching bookings in the period.
          </p>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyReportState
              title="No catalog packages"
              description="Create active service packages to see them here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">Package</th>
                    <th className="pb-3 font-medium">Bundle</th>
                    <th className="pb-3 text-right font-medium">Bookings</th>
                    <th className="pb-3 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((pkg) => (
                    <tr key={pkg.id} className="border-b last:border-0">
                      <td className="py-4">
                        <div className="font-medium">{pkg.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{pkg.id}</div>
                      </td>
                      <td className="py-4">
                        <Badge variant="secondary">
                          {pkg.services_included} item{pkg.services_included === 1 ? "" : "s"}
                        </Badge>
                      </td>
                      <td className="py-4 text-right tabular-nums">{pkg.total_sold}</td>
                      <td className="py-4 text-right tabular-nums font-medium">{formatMoney(pkg.total_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Currency: {currencyCode}.</p>
        </CardContent>
      </Card>
    </SettingsDetailLayout>
  );
}
