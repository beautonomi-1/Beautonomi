"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, DollarSign, Package } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface ProductSalesData {
  totalProductsSold: number;
  totalRevenue: number;
  totalCost?: number;
  totalProfit?: number;
  averageProductValue: number;
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

export default function ProductSalesReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<ProductSalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [dateRange]);

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
            subtitle="Track product sales and performance"
          />
          <Button 
            variant="outline" 
            onClick={() => {
              if (!data) return;
              const exportData = formatReportDataForExport(data, "product-sales");
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

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Products Sold
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.totalProductsSold}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.totalRevenue.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {(data.totalProfit ?? data.totalRevenue - (data.totalCost ?? 0)).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Average Product Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-gray-500" />
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averageProductValue.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Products */}
        {data.topProducts && data.topProducts.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Top Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.topProducts.map((product, index) => (
                <div
                  key={product.productId}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF0077] to-[#D60565] flex items-center justify-center text-white font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {product.productName}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-xs text-gray-600">
                          {product.quantitySold} sold
                        </p>
                        <p className="text-xs text-gray-500">
                          Avg: ZAR {product.averagePrice.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      ZAR {product.revenue.toLocaleString()}
                    </p>
                    {product.profit != null && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Profit: ZAR {product.profit.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Top Products</CardTitle>
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
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Products by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.productsByCategory.map((category) => (
                  <div
                    key={category.category}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <p className="text-sm font-medium text-gray-900 mb-2 capitalize">
                      {category.category || "Uncategorized"}
                    </p>
                    <p className="text-lg font-semibold text-gray-900">
                      {category.quantitySold} sold
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Revenue: ZAR {category.revenue.toLocaleString()}
                      {category.profit != null && (
                        <> · Profit: ZAR {category.profit.toLocaleString()}</>
                      )}
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
