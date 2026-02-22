"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, DollarSign, TrendingUp, Percent, Calendar } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface PayoutsData {
  totalPayouts: number;
  totalPayoutAmount: number;
  totalGrossAmount: number;
  totalPlatformFees: number;
  totalRefunded: number;
  averagePayout: number;
  platformFeeRate: number;
  monthlyBreakdown: Array<{
    month: string;
    count: number;
    amount: number;
  }>;
  recentPayouts: Array<{
    paymentId: string;
    grossAmount: number;
    refundedAmount: number;
    netAmount: number;
    platformFee: number;
    payoutAmount: number;
    createdAt: string;
  }>;
}

export default function PayoutsReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });
  const [data, setData] = useState<PayoutsData | null>(null);
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

      const response = await fetcher.get<{ data: PayoutsData }>(
        `/api/provider/reports/payments/payouts?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading payouts:", err);
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
    const exportData = formatReportDataForExport(data, "payouts");
    exportToCSV(exportData, "payouts-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Payouts" },
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
          { label: "Payouts" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load payouts data"}
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
        { label: "Payouts" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Payouts"
          subtitle="Track payouts and platform fees"
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
              <CardTitle className="text-sm font-medium text-gray-600">Total Payouts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalPayouts}</p>
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Payout Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.totalPayoutAmount.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Platform Fees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.totalPlatformFees.toLocaleString()}
                </p>
                <Percent className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-xs text-gray-500 mt-1">{data.platformFeeRate}% fee rate</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Payout</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averagePayout.toLocaleString()}
                </p>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Breakdown */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Monthly Payouts</CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthlyBreakdown.length === 0 ? (
              <EmptyReportState title="No payouts" description="No payout data available for the selected period." />
            ) : (
              <div className="space-y-3">
                {data.monthlyBreakdown.map((item) => {
                  const [year, month] = item.month.split("-");
                  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  return (
                    <div
                      key={item.month}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{monthName}</p>
                        <p className="text-sm text-gray-600">{item.count} payouts</p>
                      </div>
                      <p className="font-semibold text-gray-900">
                        ZAR {item.amount.toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Payouts */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Recent Payouts</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentPayouts.length === 0 ? (
              <EmptyReportState title="No payouts" description="No payout data available." />
            ) : (
              <div className="space-y-3">
                {data.recentPayouts.map((payout) => (
                  <div
                    key={payout.paymentId}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {format(new Date(payout.createdAt), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                      <p className="text-sm text-gray-600">
                        Gross: ZAR {payout.grossAmount.toLocaleString()} • 
                        Fee: ZAR {payout.platformFee.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">
                        ZAR {payout.payoutAmount.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">net payout</p>
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
