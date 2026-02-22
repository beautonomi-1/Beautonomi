"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Gift, DollarSign, TrendingUp, Percent } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface GiftCardRedemptionsData {
  totalRedemptions: number;
  totalRedeemedValue: number;
  averageRedemptionValue: number;
  redemptionRate: number;
  redemptions: Array<{
    id: string;
    amount: number;
    redeemed_at: string;
  }>;
}

export default function GiftCardRedemptionsReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<GiftCardRedemptionsData | null>(null);
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

      const response = await fetcher.get<{ data: GiftCardRedemptionsData }>(
        `/api/provider/reports/gift-cards/redemptions?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading gift card redemptions:", err);
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
    const exportData = formatReportDataForExport(data, "gift-card-redemptions");
    exportToCSV(exportData, "gift-card-redemptions-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Gift Card Redemptions" },
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
          { label: "Gift Card Redemptions" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load gift card redemptions data"}
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
        { label: "Gift Card Redemptions" },
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Redemptions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalRedemptions}</p>
                <Gift className="w-5 h-5 text-pink-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Redeemed Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.totalRedeemedValue.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Redemption Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  N/A
                </p>
                <Percent className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-xs text-gray-500 mt-1">Platform-wide cards</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Average Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averageRedemptionValue.toLocaleString()}
                </p>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Redemptions */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Recent Redemptions</CardTitle>
          </CardHeader>
          <CardContent>
            {data.redemptions.length === 0 ? (
              <EmptyReportState title="No redemptions" description="No gift card redemptions in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.redemptions.map((redemption) => (
                  <div
                    key={redemption.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {format(new Date(redemption.redeemed_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <p className="font-semibold text-gray-900">
                      ZAR {Number(redemption.amount || 0).toLocaleString()}
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
