"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, DollarSign, AlertTriangle, TrendingDown } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface RefundsData {
  totalRefunds: number;
  totalRefundAmount: number;
  totalPaymentAmount: number;
  refundRate: number;
  averageRefundAmount: number;
  methodBreakdown: Array<{
    method: string;
    count: number;
    amount: number;
    percentage: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    count: number;
    amount: number;
  }>;
  recentRefunds: Array<{
    id: string;
    amount: number;
    refunded_amount: number;
    payment_provider: string;
    created_at: string;
    refunded_at: string;
  }>;
}

export default function RefundsReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<RefundsData | null>(null);
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

      const response = await fetcher.get<{ data: RefundsData }>(
        `/api/provider/reports/payments/refunds?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading refunds:", err);
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
    const exportData = formatReportDataForExport(data, "refunds");
    exportToCSV(exportData, "refunds-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Refunds" },
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
          { label: "Refunds" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load refunds data"}
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
        { label: "Refunds" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Refunds"
          subtitle="Track refunds and analyze refund patterns"
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
              <CardTitle className="text-sm font-medium text-gray-600">Total Refunds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalRefunds}</p>
                <RefreshCw className="w-5 h-5 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Refund Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.totalRefundAmount.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Refund Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.refundRate.toFixed(2)}%
                </p>
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Refund Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averageRefundAmount.toLocaleString()}
                </p>
                <TrendingDown className="w-5 h-5 text-gray-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Refunds by Method */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Refunds by Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            {data.methodBreakdown.length === 0 ? (
              <EmptyReportState title="No refunds" description="No refunds in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.methodBreakdown.map((method) => (
                  <div
                    key={method.method}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{method.method}</p>
                      <p className="text-sm text-gray-600">
                        {method.percentage.toFixed(1)}% of refunds
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        ZAR {method.amount.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-600">{method.count} refunds</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Refunds */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Recent Refunds</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentRefunds.length === 0 ? (
              <EmptyReportState title="No refunds" description="No refunds in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.recentRefunds.map((refund) => (
                  <div
                    key={refund.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{refund.payment_provider}</p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(refund.refunded_at || refund.created_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">
                        -ZAR {Number(refund.refunded_amount || 0).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-600">
                        from ZAR {Number(refund.amount || 0).toLocaleString()}
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
