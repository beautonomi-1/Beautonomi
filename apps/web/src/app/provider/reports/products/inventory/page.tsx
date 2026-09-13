"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Download,
  Package,
  AlertTriangle,
  DollarSign,
  CheckCircle,
  Archive,
  Layers,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";
import { format } from "date-fns";

interface InventoryData {
  timezone?: string;
  asOf?: string;
  reportBasis?: string;
  basis?: {
    scope?: string;
    quantityRule?: string;
    valueRule?: string;
    alertsRule?: string;
    categoryRule?: string;
    previews?: string;
  };
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  productsTrackingStock?: number;
  totalStockValue: number;
  lowStockCount?: number;
  outOfStockCount?: number;
  previewLimits?: { lowStock: number; outOfStock: number };
  lowStockProducts: Array<{
    id: string;
    name: string;
    category: string | null;
    stock_quantity: number;
    price: number;
    retail_line_value?: number;
    has_variants?: boolean;
    track_stock_quantity?: boolean | null;
  }>;
  outOfStockProducts: Array<{
    id: string;
    name: string;
    category: string | null;
    stock_quantity: number;
    price: number;
    retail_line_value?: number;
    has_variants?: boolean;
  }>;
  categoryBreakdown: Array<{
    category: string;
    count: number;
    stockValue: number;
  }>;
}

export default function InventoryReport() {
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const { t } = useTranslation();
  const [data, setData] = useState<InventoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);

      const response = await fetcher.get<{ data: InventoryData }>(
        `/api/provider/reports/products/inventory`,
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

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "inventory", exportCurrency);
    exportToCSV(exportData, "inventory-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.products/inventory.title") },
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
          { label: t("web.provider.reports.pages.products/inventory.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.products/inventory.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.products/inventory.title")} />
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
          { label: t("web.provider.reports.pages.products/inventory.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.products/inventory.unableToLoad")}
        />
      </SettingsDetailLayout>
    );
  }

  const lowTotal = data.lowStockCount ?? data.lowStockProducts.length;
  const outTotal = data.outOfStockCount ?? data.outOfStockProducts.length;
  const lowPrev = data.previewLimits?.lowStock ?? data.lowStockProducts.length;
  const outPrev = data.previewLimits?.outOfStock ?? data.outOfStockProducts.length;
  const asOfLabel = data.asOf ? format(new Date(data.asOf), "MMM d, yyyy HH:mm") : "";

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.products/inventory.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.products/inventory.pageTitle")}
          subtitle={t("web.provider.reports.pages.products/inventory.subtitle")}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void loadReport()} disabled={isLoading}>
                <RefreshCw className="me-2 h-4 w-4" />
                {t("web.provider.portal.waitingRoom.refresh")}
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="me-2 h-4 w-4" />
                {t("web.provider.dataTableShell.export")}
              </Button>
            </div>
          }
        />

        {data.reportBasis ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <p className="font-medium text-sky-950">{t("web.provider.reports.common.whatThisReportCounts")}</p>
            <p className="mt-1 text-sky-950/95">{data.reportBasis}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-900/85">
              {data.timezone ? <span>{t("web.provider.reports.common.timezoneDot", { tz: data.timezone })}</span> : null}
              {asOfLabel ? <span>{t("web.provider.reports.common.generatedDot", { asOf: asOfLabel })}</span> : null}
            </div>
          </div>
        ) : null}

        {data.basis ? (
          <Card className="border-violet-100 bg-violet-50/40 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-violet-950">{t("web.provider.reports.common.definitions")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-violet-950/95">
              {data.basis.scope ? (
                <p>
                  <span className="font-medium">{t("web.provider.reports.pages.products/inventory.scope")}</span>
                  {data.basis.scope}
                </p>
              ) : null}
              {data.basis.quantityRule ? (
                <p>
                  <span className="font-medium">{t("web.provider.reports.pages.products/inventory.quantity")}</span>
                  {data.basis.quantityRule}
                </p>
              ) : null}
              {data.basis.valueRule ? (
                <p>
                  <span className="font-medium">{t("web.provider.reports.pages.products/inventory.stockValue")}</span>
                  {data.basis.valueRule}
                </p>
              ) : null}
              {data.basis.alertsRule ? (
                <p>
                  <span className="font-medium">{t("web.provider.reports.pages.products/inventory.alerts")}</span>
                  {data.basis.alertsRule}
                </p>
              ) : null}
              {data.basis.categoryRule ? (
                <p>
                  <span className="font-medium">{t("web.provider.reports.pages.products/inventory.byCategory")}</span>
                  {data.basis.categoryRule}
                </p>
              ) : null}
              {data.basis.previews ? (
                <p className="text-violet-900/90">
                  <span className="font-medium">{t("web.provider.reports.pages.products/inventory.lists")}</span>
                  {data.basis.previews}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">{t("web.provider.reports.pages.products/inventory.catalogue")}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.products/inventory.catalogueSkus")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalProducts}</p>
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <p className="mt-2 text-xs text-gray-500 leading-snug">{t("web.provider.reports.pages.products/inventory.allProductRows")}</p>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.products/inventory.active")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.activeProducts}</p>
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="mt-2 text-xs text-gray-500 leading-snug">{t("web.provider.reports.pages.products/inventory.isActiveTrue")}</p>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.products/inventory.inactive")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.inactiveProducts}</p>
                  <Archive className="h-5 w-5 text-gray-500" />
                </div>
                <p className="mt-2 text-xs text-gray-500 leading-snug">{t("web.provider.reports.pages.products/inventory.isActiveNotTrue")}</p>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.products/inventory.trackingStock")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">
                    {data.productsTrackingStock ?? 0}
                  </p>
                  <Layers className="h-5 w-5 text-indigo-600" />
                </div>
                <p className="mt-2 text-xs text-gray-500 leading-snug">{t("web.provider.reports.pages.products/inventory.trackNotFalse")}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">{t("web.provider.reports.pages.products/inventory.retailValueAlerts")}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="border-emerald-100 bg-emerald-50/40 shadow-sm md:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-emerald-900">{t("web.provider.reports.pages.products/inventory.retailStockValue")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xl font-semibold tabular-nums text-emerald-950">{fmt(data.totalStockValue)}</p>
                  <DollarSign className="h-5 w-5 shrink-0 text-emerald-700" />
                </div>
                <p className="mt-2 text-xs text-emerald-900/85 leading-snug">
                  {t("web.provider.reports.pages.products/inventory.retailStockValueHint")}
                </p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-amber-950">{t("web.provider.reports.pages.products/inventory.lowStock")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold tabular-nums text-amber-900">{lowTotal}</p>
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <p className="mt-2 text-xs text-amber-900/85 leading-snug">
                  {t("web.provider.reports.pages.products/inventory.lowStockHint", {
                    shown: Math.min(data.lowStockProducts.length, lowPrev),
                    total: lowTotal,
                  })}
                </p>
              </CardContent>
            </Card>

            <Card className="border-red-200 bg-red-50/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-red-950">{t("web.provider.reports.pages.products/inventory.outOfStock")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-semibold tabular-nums text-red-900">{outTotal}</p>
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <p className="mt-2 text-xs text-red-900/85 leading-snug">
                  {t("web.provider.reports.pages.products/inventory.outOfStockHint", {
                    shown: Math.min(data.outOfStockProducts.length, outPrev),
                    total: outTotal,
                  })}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Low Stock Products */}
        {data.lowStockProducts.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base text-amber-950">{t("web.provider.reports.pages.products/inventory.lowStockPreview")}</CardTitle>
              <p className="text-sm font-normal text-amber-900/85">
                {t("web.provider.reports.pages.products/inventory.lowStockPreviewHint")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.lowStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex flex-col gap-2 rounded-xl border border-amber-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-600">{product.category ?? t("web.provider.reports.pages.products/inventory.uncategorized")}</p>
                      {product.has_variants ? (
                        <p className="text-xs text-gray-500">{t("web.provider.reports.pages.products/inventory.hasVariants")}</p>
                      ) : null}
                    </div>
                    <div className="text-end sm:shrink-0">
                      <p className="font-semibold tabular-nums text-amber-800">{t("web.provider.reports.pages.products/inventory.onHand", { count: product.stock_quantity })}</p>
                      <p className="text-sm text-gray-600">
                        {t("web.provider.reports.pages.products/inventory.fromPrice", { amount: fmt(Number(product.price || 0)) })}
                        {typeof product.retail_line_value === "number"
                          ? t("web.provider.reports.pages.products/inventory.lineValue", { amount: fmt(product.retail_line_value) })
                          : null}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Out of Stock Products */}
        {data.outOfStockProducts.length > 0 && (
          <Card className="border-red-200 bg-red-50/50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base text-red-950">{t("web.provider.reports.pages.products/inventory.outOfStockPreview")}</CardTitle>
              <p className="text-sm font-normal text-red-900/85">{t("web.provider.reports.pages.products/inventory.outOfStockPreviewHint")}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.outOfStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex flex-col gap-2 rounded-xl border border-red-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-600">{product.category ?? t("web.provider.reports.pages.products/inventory.uncategorized")}</p>
                    </div>
                    <div className="text-end sm:shrink-0">
                      <p className="font-semibold tabular-nums text-red-700">{t("web.provider.reports.pages.products/inventory.zeroOnHand")}</p>
                      <p className="text-sm text-gray-600">{t("web.provider.reports.pages.products/inventory.fromPrice", { amount: fmt(Number(product.price || 0)) })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Category Breakdown */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t("web.provider.reports.pages.products/inventory.valueByCategory")}</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              {t("web.provider.reports.pages.products/inventory.valueByCategoryHint")}
            </p>
          </CardHeader>
          <CardContent>
            {data.categoryBreakdown.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.products/inventory.noCategories")} description={t("web.provider.reports.pages.products/inventory.noCategoriesDesc")} />
            ) : (
              <div className="space-y-3">
                {data.categoryBreakdown.map((category) => (
                  <div
                    key={category.category}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-100/80"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{category.category}</p>
                      <p className="text-sm text-gray-600">{t("web.provider.reports.pages.products/inventory.productsCount", { count: category.count })}</p>
                    </div>
                    <p className="font-semibold tabular-nums text-gray-900">{fmt(category.stockValue)}</p>
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
