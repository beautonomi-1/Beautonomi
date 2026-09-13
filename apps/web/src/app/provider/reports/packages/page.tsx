"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Package, TrendingUp, Layers, BarChart3 } from "lucide-react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetcher , FetchError } from "@/lib/http/fetcher";
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

function periodOptions(t: (k: string) => string): Array<{ value: Period; label: string }> {
  return [
    { value: "month", label: t("web.provider.common.dateRange.month") },
    { value: "quarter", label: t("web.provider.reports.pages.packages.quarter") },
    { value: "year", label: t("web.provider.reports.pages.packages.year") },
    { value: "all", label: t("web.provider.reports.pages.packages.allTime") },
  ];
}

function basisLabels(t: (k: string) => string): Record<string, string> {
  return {
    catalog: t("web.provider.reports.pages.packages.catalog"),
    aggregates: t("web.provider.reports.pages.packages.totals"),
    revenue: t("web.provider.reports.pages.packages.value"),
  };
}

export default function PackageOverviewReport() {
  const { t } = useTranslation();
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode, format: formatMoney } = useReportCurrency();
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<PackageOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
      setIsSubscriptionRequired(false);
        const params = new URLSearchParams({ period });
        appendLocation(params);
        const res = await fetcher.get<{ data: PackageOverviewData }>(
          `/api/provider/reports/packages?${params.toString()}`,
        );
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("web.provider.reports.pages.packages.failedToLoad"));
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
        [t("web.provider.reports.pages.packages.package")]: pkg.name,
        [t("web.provider.sidebar.items.bookings")]: pkg.total_sold,
        [t("web.provider.pages.team/totals.revenue")]: pkg.total_revenue,
        [t("web.provider.reports.pages.packages.csvServices")]: pkg.services_included,
      })),
      `packages-overview-${period}`,
    );
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.packages.title") },
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
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.packages.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.packages.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.packages.title")} />
        </div>
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.packages.title") },
        ]}
      >
        <EmptyReportState title={t("web.provider.common.failedToLoadReport")} description={error || t("web.provider.reports.pages.packages.unableToLoad")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.packages.title") },
      ]}
    >
      <PageHeader
        title={t("web.provider.reports.pages.packages.title")}
        subtitle={t("web.provider.reports.pages.packages.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/provider/reports/packages/sales">
              <Button variant="outline">{t("web.provider.reports.pages.packages.packageSales")}</Button>
            </Link>
            <Link href="/provider/reports/packages/usage">
              <Button variant="outline">{t("web.provider.reports.pages.packages.packageUsage")}</Button>
            </Link>
            <Button variant="outline" onClick={handleExport}>
              <Download className="me-2 h-4 w-4" />
              {t("web.provider.common.exportCsv")}
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {periodOptions(t).map((option) => (
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
          <p className="font-medium text-sky-950">{t("web.provider.reports.common.whatThisReportCounts")}</p>
          <p className="mt-1 text-sky-950/95">{data.reportBasis}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-900/85">
{data.timezone ? <span>{t("web.provider.reports.common.timezoneDot", { tz: data.timezone })}</span> : null}
            {data.fromYmd && data.toYmd ? (
              <span>
                {t("web.provider.reports.pages.packages.window", { from: data.fromYmd, to: data.toYmd })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {basisEntries.length > 0 ? (
        <Card className="mb-6 border-violet-100 bg-violet-50/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-violet-950">{t("web.provider.reports.common.definitions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-violet-950/95">
            {basisEntries.map(([k, v]) => (
              <p key={k}>
                <span className="font-medium">{basisLabels(t)[k] ?? k} · </span>
                {v}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("web.provider.reports.pages.packages.catalogPackages")}</CardTitle>
            <Layers className="h-4 w-4 text-cyan-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{data.stats.total_packages}</div>
            <p className="text-xs text-muted-foreground leading-snug">{t("web.provider.reports.pages.packages.catalogHint")}</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("web.provider.reports.pages.packages.bookingsInWindow")}</CardTitle>
            <Package className="h-4 w-4 text-cyan-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{data.stats.total_sold}</div>
            <p className="text-xs text-muted-foreground leading-snug">
              {t("web.provider.reports.pages.packages.bookingsHint")}
            </p>
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("web.provider.reports.pages.packages.bookedValue")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatMoney(data.stats.total_revenue)}</div>
            <p className="text-xs text-muted-foreground leading-snug">{t("web.provider.reports.pages.packages.bookedValueHint")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5" />
            {t("web.provider.reports.pages.packages.byCatalog")}
          </CardTitle>
          <p className="text-sm font-normal text-muted-foreground mt-1">
            {t("web.provider.reports.pages.packages.byCatalogHint")}
          </p>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyReportState
              title={t("web.provider.reports.pages.packages.noCatalog")}
              description={t("web.provider.reports.pages.packages.noCatalogDesc")}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="pb-3 font-medium">{t("web.provider.reports.pages.packages.package")}</th>
                    <th className="pb-3 font-medium">{t("web.provider.reports.pages.packages.bundle")}</th>
                    <th className="pb-3 text-end font-medium">{t("web.provider.sidebar.items.bookings")}</th>
                    <th className="pb-3 text-end font-medium">{t("web.provider.reports.pages.packages.value")}</th>
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
                          {t("web.provider.reports.pages.packages.items", { count: pkg.services_included })}
                        </Badge>
                      </td>
                      <td className="py-4 text-end tabular-nums">{pkg.total_sold}</td>
                      <td className="py-4 text-end tabular-nums font-medium">{formatMoney(pkg.total_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{t("web.provider.reports.pages.packages.currency", { code: currencyCode })}</p>
        </CardContent>
      </Card>
    </SettingsDetailLayout>
  );
}
