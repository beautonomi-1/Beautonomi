"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ShoppingBag, DollarSign, Hash } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
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

const BASIS_LABELS: Record<string, string> = {
  bookingLines: "Appointment lines",
  orderLines: "Retail order lines",
  revenue: "Line revenue",
  ranking: "Ranking",
  timesSold: "Line row count",
  averages: "Average price",
};

export default function TopProductsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<TopProductsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [dateRange, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

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
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading top products:", err);
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
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Top Products" },
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
          { label: "Top Products" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load top products data"}
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
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Top Products" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Top Products"
          subtitle="Products ranked by total retail line revenue — appointment add-ons (by scheduled date) and paid product orders (by order date). Same mixed window as Product Sales."
          actions={
            <Button variant="outline" onClick={handleExport} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              Export
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
            <p className="font-medium text-sky-950">What this report counts</p>
            <p className="mt-1 text-sky-950/95">{data.reportBasis}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-900/85">
              {data.timezone ? <span>Timezone · {data.timezone}</span> : null}
              {data.fromYmd && data.toYmd ? (
                <span>
                  Calendar window · {data.fromYmd} – {data.toYmd}
                </span>
              ) : null}
              <span>List cap · top {listLimit} SKUs by revenue</span>
            </div>
          </div>
        ) : null}

        {basisEntries.length > 0 ? (
          <Card className="border-violet-100 bg-violet-50/40 shadow-sm">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Units sold (all SKUs in window)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalProductsSold}</p>
                <ShoppingBag className="h-5 w-5 shrink-0 text-blue-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-snug">
                Sum of quantities across every product line in range — not only the ranked list.
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Line revenue (all SKUs in window)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalRevenue)}</p>
                <DollarSign className="h-5 w-5 shrink-0 text-green-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-snug">
                Total of line amounts for all products with any sales in the period.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Ranked products</CardTitle>
            <p className="text-sm font-normal text-gray-500 mt-1">
              Top {Math.min(data.topProducts.length, listLimit)} shown · sorted by line revenue · avg price is revenue ÷
              units for that SKU.
            </p>
          </CardHeader>
          <CardContent>
            {data.topProducts.length === 0 ? (
              <EmptyReportState title="No products sold" description="No qualifying product lines in the selected period." />
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
                    <div className="text-left sm:text-right shrink-0">
                      <p className="text-lg font-semibold tabular-nums text-gray-900">{fmt(product.totalRevenue)}</p>
                      <p className="text-sm text-gray-600">
                        {product.totalQuantity} units · <span className="tabular-nums">{fmt(product.averagePrice)}</span>{" "}
                        avg / unit
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <Hash className="h-3 w-3 shrink-0" />
                        {product.timesSold} line rows (booking or order lines, not visits)
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
