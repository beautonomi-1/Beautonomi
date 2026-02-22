"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Package, AlertTriangle, DollarSign, CheckCircle } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface InventoryData {
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  totalStockValue: number;
  lowStockProducts: Array<{
    id: string;
    name: string;
    category: string;
    stock_quantity: number;
    price: number;
  }>;
  outOfStockProducts: Array<{
    id: string;
    name: string;
    category: string;
    stock_quantity: number;
    price: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    count: number;
    stockValue: number;
  }>;
  allProducts: Array<{
    id: string;
    name: string;
    category: string;
    price: number;
    stock_quantity: number;
    is_active: boolean;
  }>;
}

export default function InventoryReport() {
  const [data, setData] = useState<InventoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: InventoryData }>(
        `/api/provider/reports/products/inventory`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading inventory:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data, "inventory");
    exportToCSV(exportData, "inventory-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Inventory" },
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
          { label: "Inventory" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load inventory data"}
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
        { label: "Inventory" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Inventory"
          subtitle="Monitor product inventory and stock levels"
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalProducts}</p>
                <Package className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Active Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.activeProducts}</p>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Stock Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.totalStockValue.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Low Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.lowStockProducts.length}</p>
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Products */}
        {data.lowStockProducts.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-orange-900">Low Stock Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.lowStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-orange-200 bg-white"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-600">{product.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-orange-600">{product.stock_quantity} left</p>
                      <p className="text-sm text-gray-600">
                        ZAR {Number(product.price || 0).toLocaleString()}
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
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-red-900">Out of Stock Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.outOfStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-white"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-600">{product.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">0 in stock</p>
                      <p className="text-sm text-gray-600">
                        ZAR {Number(product.price || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Category Breakdown */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Inventory by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {data.categoryBreakdown.length === 0 ? (
              <EmptyReportState title="No categories" description="No product categories available." />
            ) : (
              <div className="space-y-3">
                {data.categoryBreakdown.map((category) => (
                  <div
                    key={category.category}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{category.category}</p>
                      <p className="text-sm text-gray-600">{category.count} products</p>
                    </div>
                    <p className="font-semibold text-gray-900">
                      ZAR {category.stockValue.toLocaleString()}
                    </p>
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
