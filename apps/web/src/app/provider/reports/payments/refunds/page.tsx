"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Download,
  RefreshCw,
  DollarSign,
  AlertTriangle,
  TrendingDown,
  Info,
  Wallet,
  Percent,
} from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ProviderRefundsReportResponse } from "@/app/api/provider/reports/payments/refunds/route";

const METHOD_LABEL: Record<string, string> = {
  ledger: "Ledger (unlinked)",
  product_order: "Retail / product order",
  paystack: "Paystack",
  yoco: "Yoco",
  stripe: "Stripe",
  cash: "Cash",
  card: "Card",
  wallet: "Wallet",
  bank_transfer: "Bank transfer",
  other: "Other",
};

function formatMethodLabel(m: string): string {
  return METHOD_LABEL[m] ?? m.replace(/_/g, " ");
}

type RefundsData = ProviderRefundsReportResponse;

export default function RefundsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<RefundsData | null>(null);
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
      appendLocation(params);

      const response = await fetcher.get<{ data: RefundsData }>(
        `/api/provider/reports/payments/refunds?${params.toString()}`,
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      setData(null);
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
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "refunds", exportCurrency);
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

  const share = data.refundShareOfPaymentLedgerPercent ?? data.refundRate ?? 0;
  const payDenom = data.totalPaymentLedgerAmount ?? data.totalPaymentAmount ?? 0;

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
          subtitle="Ledger refund rows and provider earnings reversals — same window as your filters"
          actions={
            <Button variant="outline" onClick={handleExport} className="min-h-[44px]">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          }
        />

        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} onReset={handleReset} />

        <Alert className="border-sky-200 bg-sky-50 text-sky-950">
          <Info className="h-4 w-4 text-sky-800" />
          <div>
            <AlertTitle className="text-sky-950">How to read this report</AlertTitle>
            <AlertDescription className="text-sky-950/90 space-y-2 text-sm leading-relaxed">
              <p>{data.reportBasis}</p>
              {data.timezone ? (
                <p className="text-xs text-sky-900/85">
                  Dates bucket using provider timezone: <strong>{data.timezone}</strong>
                </p>
              ) : null}
            </AlertDescription>
          </div>
        </Alert>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <Card className="border-gray-200 border-l-4 border-l-rose-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Refund ledger rows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalRefunds}</p>
                <RefreshCw className="w-5 h-5 shrink-0 text-rose-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Count of <code className="text-[11px]">finance_transactions</code> refund rows in range
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Customer refund gross</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalRefundAmount)}</p>
                <DollarSign className="w-5 h-5 shrink-0 text-red-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">Absolute sum of refund row amounts (money back to customers)</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Provider earnings reversal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">
                  {fmt(data.providerEarningsReversed)}
                </p>
                <Wallet className="w-5 h-5 shrink-0 text-violet-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">Negative provider_earnings ledger rows (your net clawback)</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Payment ledger (denominator)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(payDenom)}</p>
                <Percent className="w-5 h-5 shrink-0 text-slate-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Sum of payment-type ledger rows in the same filter — used only for the ratio below
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Refund ÷ payment ledger</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{share.toFixed(2)}%</p>
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">Not “refunds ÷ revenue” — different ledger slices</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg refund</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.averageRefundAmount)}</p>
                <TrendingDown className="w-5 h-5 shrink-0 text-gray-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">Mean customer refund gross per refund row</p>
            </CardContent>
          </Card>
        </div>

        {/* Refunds by Method */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>By refund path</CardTitle>
            <p className="text-sm text-gray-500 font-normal mt-1">
              Grouped from linked booking payments when <code className="text-xs">source_refund_id</code> exists;
              product-order refunds are labeled separately.
            </p>
          </CardHeader>
          <CardContent>
            {data.methodBreakdown.length === 0 ? (
              <EmptyReportState title="No refunds" description="No refund ledger rows in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.methodBreakdown.map((method) => (
                  <div
                    key={method.method}
                    className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/80"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{formatMethodLabel(method.method)}</p>
                      <p className="text-sm text-gray-600">
                        {method.percentage.toFixed(1)}% of refund gross · {method.count} row
                        {method.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums text-gray-900">{fmt(method.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {data.dailyBreakdown.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>By day (provider timezone)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.dailyBreakdown.map((d) => (
                  <div key={d.date} className="rounded-xl border border-gray-100 bg-white p-4">
                    <p className="text-xs font-medium text-gray-500">{d.date}</p>
                    <p className="text-lg font-semibold tabular-nums text-gray-900 mt-1">{fmt(d.amount)}</p>
                    <p className="text-xs text-gray-500">{d.count} row{d.count !== 1 ? "s" : ""}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Recent Refunds */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Recent refund rows</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentRefunds.length === 0 ? (
              <EmptyReportState title="No refunds" description="No refund ledger rows in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.recentRefunds.map((refund) => (
                  <div
                    key={refund.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 rounded-xl border border-gray-100 bg-white"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {refund.paymentMethodLabel ? formatMethodLabel(refund.paymentMethodLabel) : "Ledger"}
                        {refund.booking_id ? (
                          <span className="text-xs font-normal text-gray-500 ml-2">booking-linked</span>
                        ) : null}
                        {refund.product_order_id ? (
                          <span className="text-xs font-normal text-gray-500 ml-2">order-linked</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(refund.created_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                      {refund.reason ? <p className="text-xs text-gray-500 mt-1 line-clamp-2">{refund.reason}</p> : null}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums text-red-700">{fmt(refund.amount)}</p>
                      <p className="text-xs text-gray-500">customer refund gross</p>
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
