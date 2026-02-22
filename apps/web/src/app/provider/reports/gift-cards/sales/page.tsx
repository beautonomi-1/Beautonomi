"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Gift, DollarSign, TrendingUp } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface GiftCardSalesData {
  totalGiftCardsSold: number;
  totalRevenue: number;
  averageGiftCardValue: number;
  giftCardSales: Array<{
    amount: number;
    count: number;
    revenue: number;
    percentage: number;
  }>;
}

export default function GiftCardSalesReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<GiftCardSalesData | null>(null);
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

      const response = await fetcher.get<{ data: GiftCardSalesData }>(
        `/api/provider/reports/gift-cards/sales?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading gift card sales:", err);
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
    const exportData = formatReportDataForExport(data, "gift-card-sales");
    exportToCSV(exportData, "gift-card-sales-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Gift Card Sales" },
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
          { label: "Gift Card Sales" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load gift card sales data"}
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
        { label: "Gift Card Sales" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Gift Card Redemptions"
          subtitle="Track gift cards redeemed at your business (platform sells all gift cards)"
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          }
        />

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Gift Cards Redeemed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalGiftCardsSold}</p>
                <Gift className="w-5 h-5 text-pink-600" />
              </div>
              <p className="text-xs text-gray-500 mt-1">Platform gift cards used</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Redeemed Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.totalRevenue.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-xs text-gray-500 mt-1">Value of gift cards used</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Average Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averageGiftCardValue.toLocaleString()}
                </p>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gift Card Sales Breakdown */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Redemptions by Amount</CardTitle>
          </CardHeader>
          <CardContent>
            {data.giftCardSales.length === 0 ? (
              <EmptyReportState title="No gift card redemptions" description="No gift cards were redeemed at your business in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.giftCardSales.map((sale) => (
                  <div
                    key={sale.amount}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">ZAR {sale.amount.toLocaleString()}</p>
                      <p className="text-sm text-gray-600">
                        {sale.percentage.toFixed(1)}% of redemptions
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {sale.count} cards
                      </p>
                      <p className="text-sm text-gray-600">
                        ZAR {sale.revenue.toLocaleString()}
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
