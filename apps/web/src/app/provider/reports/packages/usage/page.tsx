"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Package, Users } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface PackageUsageData {
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  reportBasis?: string;
  basis?: Record<string, string>;
  totalPackagesUsed: number;
  totalUniqueClients: number;
  packageUsage: Array<{
    packageId: string;
    packageName: string;
    totalUsage: number;
    uniqueClientsCount: number;
    averageUsagePerClient: number;
  }>;
  topClients: Array<{
    clientId: string;
    clientName: string;
    email: string;
    packagesUsed: number;
  }>;
}

export default function PackageUsageReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { t } = useTranslation();
  const { currencyCode: exportCurrency } = useReportCurrency();
  const basisLabels: Record<string, string> = {
    usage: t("web.provider.reports.pages.packages/usage.basisUsage"),
    uniqueClients: t("web.provider.reports.pages.packages/usage.basisClients"),
    topClients: t("web.provider.reports.pages.packages/usage.basisTopClients"),
  };
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });
  const [data, setData] = useState<PackageUsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadReport();
  }, [dateRange, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);

      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      appendLocation(params);

      const response = await fetcher.get<{ data: PackageUsageData }>(
        `/api/provider/reports/packages/usage?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      const parsed = parseReportLoadError(err);
      if (parsed.subscriptionRequired) {
        setIsSubscriptionRequired(true);
        setError(null);
      } else {
        setError(parsed.message);
        setIsSubscriptionRequired(false);
      }
      console.error("Error loading report:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setDateRange({
      from: subDays(new Date(), 90),
      to: new Date(),
    });
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "package-usage", exportCurrency);
    exportToCSV(exportData, "package-usage-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.packages/usage.title") },
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
          { label: t("web.provider.reports.pages.packages/usage.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.packages/usage.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.packages/usage.title")} />
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
          { label: t("web.provider.reports.pages.packages/usage.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.packages/usage.unableToLoad")}
        />
      </SettingsDetailLayout>
    );
  }

  const basisEntries = data.basis
    ? (Object.entries(data.basis) as [string, string][]).filter(([, v]) => v?.trim())
    : [];

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.packages/usage.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.packages/usage.title")}
          subtitle={t("web.provider.reports.pages.packages/usage.subtitle")}
          actions={
            <Button variant="outline" onClick={handleExport} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              {t("web.provider.common.export")}
            </Button>
          }
        />

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        {data.reportBasis ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <p className="font-medium text-sky-950">{t("web.provider.reports.common.whatThisReportCounts")}</p>
            <p className="mt-1 text-sky-950/95">{data.reportBasis}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-900/85">
              {data.timezone ? <span>{t("web.provider.reports.common.timezoneDot", { tz: data.timezone })}</span> : null}
              {data.fromYmd && data.toYmd ? (
                <span>
                  {t("web.provider.reports.common.windowDot", { from: data.fromYmd, to: data.toYmd })}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {basisEntries.length > 0 ? (
          <Card className="border-violet-100 bg-violet-50/40 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-violet-950">{t("web.provider.reports.common.definitions")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-violet-950/95">
              {basisEntries.map(([k, v]) => (
                <p key={k}>
                  <span className="font-medium">{basisLabels[k] ?? k} · </span>
                  {v}
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.packages/usage.packageBookingEvents")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalPackagesUsed}</p>
                <Package className="h-5 w-5 shrink-0 text-blue-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-snug">{t("web.provider.reports.pages.packages/usage.packageBookingEventsHint")}</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.packages/usage.distinctClients")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalUniqueClients}</p>
                <Users className="h-5 w-5 shrink-0 text-purple-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-snug">
{t("web.provider.reports.pages.packages/usage.distinctClientsHint")}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>{t("web.provider.reports.pages.packages/usage.byPackage")}</CardTitle>
            <p className="text-sm font-normal text-gray-500 mt-1">
              {t("web.provider.reports.pages.packages/usage.byPackageHint")}
            </p>
          </CardHeader>
          <CardContent>
            {data.packageUsage.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.packages/usage.noUsage")} description={t("web.provider.reports.pages.packages/usage.noUsageDesc")} />
            ) : (
              <div className="space-y-2">
                {data.packageUsage.map((pkg, index) => (
                  <div
                    key={pkg.packageId}
                    className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-100/80 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-sm font-semibold text-white">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{pkg.packageName}</p>
                        <p className="text-sm text-gray-600">
                          {t("web.provider.reports.pages.packages/usage.clientsAvg", { clients: pkg.uniqueClientsCount, avg: pkg.averageUsagePerClient.toFixed(1) })}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold tabular-nums text-gray-900 shrink-0">{t("web.provider.reports.pages.packages/usage.uses", { count: pkg.totalUsage })}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {data.topClients.length > 0 && (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>{t("web.provider.reports.pages.packages/usage.topClients")}</CardTitle>
              <p className="text-sm font-normal text-gray-500 mt-1">{t("web.provider.reports.pages.packages/usage.topClientsHint")}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.topClients.map((client, index) => (
                  <div
                    key={client.clientId}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{client.clientName}</p>
                        <p className="text-sm text-gray-600 truncate">{client.email}</p>
                      </div>
                    </div>
                    <p className="font-semibold tabular-nums text-gray-900 shrink-0">{t("web.provider.reports.pages.packages/usage.bookingsCount", { count: client.packagesUsed })}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
