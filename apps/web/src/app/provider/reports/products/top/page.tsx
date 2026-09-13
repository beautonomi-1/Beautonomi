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
import { Download, ShoppingBag, DollarSign, Hash } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface TopProductsData {
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  limit?: number;
  reportBasis?: string;
  basis?: Record<string, string>;
  topProducts: Array<{
    productId: string;
    productName: string;
    category: string;
    totalQuantity: number;
    totalRevenue: number;
    averagePrice: number;
    timesSold: number;
  }>;
  totalProductsSold: number;
  totalRevenue: number;
}

export default function TopProductsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<TopProductsData | null>(null);
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
      params.append("limit", "50");
      appendLocation(params);

      const response = await fetcher.get<{ data: TopProductsData }>(
        `/api/provider/reports/products/top?${params.toString()}`,
        { timeoutMs: 120_000 },
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
      from: subDays(new Date(), 30),
      to: new Date(),
    });
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "top-products", exportCurrency);
    exportToCSV(exportData, "top-products-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.products/top.title") },
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
          { label: t("web.provider.reports.pages.products/top.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.products/top.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.products/top.title")} />
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
          { label: t("web.provider.reports.pages.products/top.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.products/top.unableToLoad")}
        />
      </SettingsDetailLayout>
    );
  }

  const basisEntries = data.basis
    ? (Object.entries(data.basis) as [string, string][]).filter(([, v]) => v?.trim())
    : [];

  const listLimit = typeof data.limit === "number" ? data.limit : data.topProducts.length;

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.products/top.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.products/top.title")}
          subtitle={t("web.provider.reports.pages.products/top.subtitle")}
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
                  {t("web.provider.reports.pages.products/top.calendarWindow", { from: data.fromYmd, to: data.toYmd })}
                </span>
              ) : null}
              <span>{t("web.provider.reports.pages.products/top.listCap", { count: listLimit })}</span>
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
                  <span className="font-medium">{t(`web.provider.reports.pages.products/top.${k}`)} · </span>
                  {v}
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.products/top.unitsSold")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalProductsSold}</p>
                <ShoppingBag className="h-5 w-5 shrink-0 text-blue-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-snug">
                {t("web.provider.reports.pages.products/top.unitsSoldHint")}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.products/top.lineRevenueAll")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalRevenue)}</p>
                <DollarSign className="h-5 w-5 shrink-0 text-green-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-snug">
                {t("web.provider.reports.pages.products/top.lineRevenueHint")}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>{t("web.provider.reports.pages.products/top.rankedProducts")}</CardTitle>
            <p className="text-sm font-normal text-gray-500 mt-1">
              {t("web.provider.reports.pages.products/top.rankedHint", { count: Math.min(data.topProducts.length, listLimit) })}
            </p>
          </CardHeader>
          <CardContent>
            {data.topProducts.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.products/top.emptyTitle")} description={t("web.provider.reports.pages.products/top.emptyDesc")} />
            ) : (
              <div className="space-y-2">
                {data.topProducts.map((product, index) => (
                  <div
                    key={product.productId}
                    className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-100/80 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-sm font-semibold text-white">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{product.productName}</p>
                        <p className="text-sm text-gray-600 capitalize">{product.category}</p>
                      </div>
                    </div>
                    <div className="text-start sm:text-end shrink-0">
                      <p className="text-lg font-semibold tabular-nums text-gray-900">{fmt(product.totalRevenue)}</p>
                      <p className="text-sm text-gray-600">
                        {t("web.provider.reports.pages.products/top.unitsAvg", { count: product.totalQuantity, amount: fmt(product.averagePrice) })}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <Hash className="h-3 w-3 shrink-0" />
                        {t("web.provider.reports.pages.products/top.lineRows", { count: product.timesSold })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
