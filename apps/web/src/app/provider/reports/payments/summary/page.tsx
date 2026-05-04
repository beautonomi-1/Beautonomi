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
  CreditCard,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface PaymentSummaryData {
  totalPayments: number;
  totalAmount: number;
  totalCollected?: number;
  grossBookedValue?: number;
  settledLedgerAmount?: number;
  customerPaymentsByMethodTotal?: number;
  providerEarnings?: number;
  providerNetActivity?: number;
  successfulPayments: number;
  failedPayments: number;
  refundedAmount: number;
  netAmount: number;
  paymentsByMethod: Array<{
    method: string;
    count: number;
    amount: number;
    percentage: number;
  }>;
  paymentsByStatus: Array<{
    status: string;
    count: number;
    amount: number;
  }>;
  averageTransactionValue: number;
  refundRate: number;
  basis?: {
    grossBookedValue?: string;
    settledLedgerAmount?: string;
    customerPaymentsByMethodTotal?: string;
    providerEarnings?: string;
    providerNetActivity?: string;
  };
  /** Walk-in / cash `booking_payments` in range with no matching `finance_transactions` payment row. */
  cashStylePaymentsWithoutLedgerCount?: number;
  cashStylePaymentsWithoutLedgerAmount?: number;
}

export default function PaymentSummaryReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<PaymentSummaryData | null>(null);
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

      const response = await fetcher.get<{ data: PaymentSummaryData }>(
        `/api/provider/reports/payments/summary?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading payment summary:", err);
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
          { label: "Payment Summary" },
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
          { label: "Payment Summary" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load payment summary data"}
        />
      </SettingsDetailLayout>
    );
  }

  const grossBookedValue = data.grossBookedValue ?? data.totalAmount;
  const settledLedgerAmount = data.settledLedgerAmount ?? data.totalCollected ?? 0;
  const providerNetActivity = data.providerNetActivity ?? data.netAmount;
  const providerEarnings = data.providerEarnings ?? 0;

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Payment Summary" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Payment Summary"
            subtitle="Booked value, settlement ledger activity, provider earnings, and payment methods"
          />
          <Button 
            variant="outline" 
            onClick={() => {
              if (!data) return;
              const exportData = formatReportDataForExport(data as unknown as ReportRow, "payment-summary", exportCurrency);
              exportToCSV(exportData, "payment-summary-report");
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

        {(data.cashStylePaymentsWithoutLedgerCount ?? 0) > 0 && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <Info className="h-4 w-4 text-amber-800" />
            <div>
              <AlertTitle className="text-amber-950">Ledger reconciliation note</AlertTitle>
              <AlertDescription className="text-amber-950/90 space-y-1">
                <p>
                  This period includes{" "}
                  <strong>{data.cashStylePaymentsWithoutLedgerCount}</strong> walk-in or cash-style payment
                  {data.cashStylePaymentsWithoutLedgerCount === 1 ? "" : "s"} (≈{" "}
                  <strong>{fmt(data.cashStylePaymentsWithoutLedgerAmount ?? 0)}</strong>) recorded in booking
                  payments but with no matching settlement row in <code className="text-xs">finance_transactions</code>
                  .
                </p>
                <p className="text-sm">
                  Gateway flows (e.g. Paystack) post automatically; cash and terminal takings may need manual
                  reconciliation against your payout ledger. Compare with{" "}
                  <a className="underline font-medium" href="/provider/reports/payments/payouts">
                    Payout earnings (ledger)
                  </a>{" "}
                  and end-of-day cash-up when closing books.
                </p>
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.totalPayments}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Gross booked value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(grossBookedValue)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Provider net activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-purple-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(providerNetActivity)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Refunded
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <ArrowDownRight className="w-5 h-5 text-red-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(data.refundedAmount)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Settled ledger amount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {fmt(settledLedgerAmount)}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Payment, wallet, and gift-card ledger rows
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Provider earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {fmt(providerEarnings)}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Net provider_earnings ledger rows
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Successful Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.successfulPayments}
                </p>
                <div className="p-2 bg-green-50 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {data.totalPayments > 0
                  ? ((data.successfulPayments / data.totalPayments) * 100).toFixed(1)
                  : 0}
                % booking-payment coverage
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Failed Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.failedPayments}
                </p>
                <div className="p-2 bg-red-50 rounded-lg">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {data.refundRate.toFixed(1)}% refund rate
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Avg Transaction
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(data.averageTransactionValue)}
                </p>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {data.basis ? (
          <Card className="border-gray-200 bg-gray-50">
            <CardContent className="pt-6">
              <div className="space-y-2 text-xs text-gray-600">
                {data.basis.grossBookedValue ? (
                  <p><strong>Gross booked value:</strong> {data.basis.grossBookedValue}</p>
                ) : null}
                {data.basis.settledLedgerAmount ? (
                  <p><strong>Settled ledger amount:</strong> {data.basis.settledLedgerAmount}</p>
                ) : null}
                {data.basis.customerPaymentsByMethodTotal ? (
                  <p><strong>Payment methods:</strong> {data.basis.customerPaymentsByMethodTotal}</p>
                ) : null}
                {data.basis.providerNetActivity ? (
                  <p><strong>Provider net activity:</strong> {data.basis.providerNetActivity}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Payments by Method */}
        {data.paymentsByMethod && data.paymentsByMethod.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Payments by Method</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.paymentsByMethod.map((method, index) => (
                <div
                  key={method.method}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF0077] to-[#D60565] flex items-center justify-center text-white font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {method.method.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-gray-600">
                        {method.count} transaction{method.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {fmt(method.amount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {method.percentage.toFixed(1)}%
                    </p>
                  </div>
                </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Payments by Method</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                No payment method data available for the selected period.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Payments by Status */}
        {data.paymentsByStatus && data.paymentsByStatus.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Payments by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.paymentsByStatus.map((status) => (
                <div
                  key={status.status}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <p className="text-xs text-gray-600 mb-1 capitalize">
                    {status.status.replace(/_/g, " ")}
                  </p>
                  <p className="text-lg font-semibold text-gray-900">
                    {status.count}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {fmt(status.amount)}
                  </p>
                </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Payments by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                No payment status data available for the selected period.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
