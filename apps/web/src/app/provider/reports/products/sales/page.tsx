"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, DollarSign, Package, Layers } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface ProductSalesData {
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  reportBasis?: string;
  basis?: {
    bookingLines?: string;
    orderLines?: string;
    profit?: string;
    topProducts?: string;
    averageRevenuePerUnit?: string;
  };
  unitsFromBookings?: number;
  revenueFromBookings?: number;
  unitsFromOrders?: number;
  revenueFromOrders?: number;
  totalProductsSold: number;
  totalRevenue: number;
  totalCost?: number;
  totalProfit?: number;
  averageProductValue: number;
  averageRevenuePerUnitSold?: number;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
    cost?: number;
    profit?: number;
    averagePrice: number;
  }>;
  productsByCategory: Array<{
    category: string;
    quantitySold: number;
    revenue: number;
    cost?: number;
    profit?: number;
  }>;
}

const BASIS_LABELS: Record<string, string> = {
  bookingLines: "Appointment add-ons",
  orderLines: "Retail orders",
  profit: "Profit",
  topProducts: "Top products",
  averageRevenuePerUnit: "Avg revenue per unit",
};

export default function ProductSalesReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<ProductSalesData | null>(null);
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
      if (dateRange.from) {
        params.append("from", dateRange.from.toISOString());
      }
      if (dateRange.to) {
        params.append("to", dateRange.to.toISOString());
      }
      appendLocation(params);

      const response = await fetcher.get<{ data: ProductSalesData }>(
        `/api/provider/reports/products/sales?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading product sales:", err);
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

  const avgPerUnit =
    typeof data?.averageRevenuePerUnitSold === "number"
      ? data.averageRevenuePerUnitSold
      : (data?.averageProductValue ?? 0);

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Product Sales" },
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
          { label: "Product Sales" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load product sales data"}
        />
      </SettingsDetailLayout>
    );
  }

  const basisEntries = data.basis
    ? (Object.entries(data.basis) as [string, string | undefined][]).filter(
        ([, v]) => typeof v === "string" && v.trim()
      )
    : [];

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Product Sales" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Product Sales"
            subtitle="Retail product lines: appointment add-ons (by scheduled date) plus paid orders (by order date). Totals combine both."
          />
          <Button
            variant="outline"
            onClick={() => {
              if (!data) return;
              const exportData = formatReportDataForExport(data as unknown as ReportRow, "product-sales", exportCurrency);
              exportToCSV(exportData, "product-sales-report");
            }}
            className="gap-2 min-h-[44px] touch-manipulation"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>

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

        {/* Key metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Units sold</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalProductsSold}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalRevenue)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total profit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                <p className="text-2xl font-semibold tabular-nums text-gray-900">
                  {fmt(data.totalProfit ?? data.totalRevenue - (data.totalCost ?? 0))}
                </p>
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-snug">
                Revenue minus cost from Σ(supply_price × quantity) where supply_price is set on the product.
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg revenue per unit sold</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-gray-500" />
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(avgPerUnit)}</p>
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-snug">
                total revenue ÷ total units across both sources (not an average per distinct product).
              </p>
            </CardContent>
          </Card>
        </div>

        {(typeof data.unitsFromBookings === "number" || typeof data.unitsFromOrders === "number") && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">By source</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="border-amber-100 bg-amber-50/50 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-amber-950 flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Appointment add-ons
                  </CardTitle>
                  <p className="text-xs text-amber-900/85 font-normal leading-snug">
                    Lines on bookings whose scheduled date falls in the window (status completed, confirmed, in progress,
                    checked in). Location filter applies to the booking when set.
                  </p>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-2xl font-semibold tabular-nums text-amber-950">
                    {fmt(data.revenueFromBookings ?? 0)}
                  </p>
                  <p className="text-sm text-amber-900/90">{data.unitsFromBookings ?? 0} units</p>
                </CardContent>
              </Card>

              <Card className="border-teal-100 bg-teal-50/50 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-teal-950 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Paid retail orders
                  </CardTitle>
                  <p className="text-xs text-teal-900/85 font-normal leading-snug">
                    Items on product_orders with payment_status paid and created_at in the window. Appointment-mirror
                    orders are excluded (those lines are counted under add-ons).
                  </p>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-2xl font-semibold tabular-nums text-teal-950">
                    {fmt(data.revenueFromOrders ?? 0)}
                  </p>
                  <p className="text-sm text-teal-900/90">{data.unitsFromOrders ?? 0} units</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Top Products */}
        {data.topProducts && data.topProducts.length > 0 ? (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Top products</CardTitle>
              <p className="text-sm text-gray-500 font-normal mt-1">
                Ranked by line revenue in this period (up to 10).
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.topProducts.map((product, index) => (
                  <div
                    key={product.productId}
                    className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white shadow-sm hover:border-gray-200 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-[#FF0077] to-[#D60565] flex items-center justify-center text-white font-semibold text-sm">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{product.productName}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                          <p className="text-xs text-gray-600">{product.quantitySold} sold</p>
                          <p className="text-xs text-gray-500">Avg line price: {fmt(product.averagePrice)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-3">
                      <p className="text-sm font-semibold tabular-nums text-gray-900">{fmt(product.revenue)}</p>
                      {product.profit != null && (
                        <p className="text-xs text-gray-500 mt-0.5 tabular-nums">Profit: {fmt(product.profit)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Top products</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                No product sales data available for the selected period.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Products by Category */}
        {data.productsByCategory.length > 0 && (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>By category</CardTitle>
              <p className="text-sm text-gray-500 font-normal mt-1">
                Aggregated line revenue and profit by product category for the same lines as above.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.productsByCategory.map((category) => (
                  <div
                    key={category.category}
                    className="p-4 rounded-xl border border-gray-100 bg-gray-50/80 hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900 mb-2 capitalize">
                      {category.category || "Uncategorized"}
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">{category.quantitySold} sold</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Revenue {fmt(category.revenue)}
                      {category.profit != null && <> · Profit {fmt(category.profit)}</>}
                    </p>
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
