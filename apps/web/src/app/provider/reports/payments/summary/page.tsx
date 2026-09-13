"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
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
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
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
  gatewayChargeCount?: number;
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
  averageBookedValueNonPending?: number;
  refundRate: number;
  reportBasis?: string;
  timezone?: string;
  basis?: {
    grossBookedValue?: string;
    settledLedgerAmount?: string;
    customerPaymentsByMethodTotal?: string;
    providerEarnings?: string;
    providerNetActivity?: string;
  };
  collectionBreakdown?: {
    ledger_payment_amount?: number;
    wallet?: number;
    gift_card?: number;
    additional_charge_payment?: number;
  };
  /** Walk-in / cash `booking_payments` in range with no matching `finance_transactions` payment row. */
  cashStylePaymentsWithoutLedgerCount?: number;
  cashStylePaymentsWithoutLedgerAmount?: number;
}

export default function PaymentSummaryReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { t } = useTranslation();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<PaymentSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadReport();
  }, [dateRange, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);

      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      appendLocation(params);

      const response = await fetcher.get<{ data: PaymentSummaryData }>(
        `/api/provider/reports/payments/summary?${params.toString()}`,
        { timeoutMs: 120_000 },
      );
      setData(response.data);
    } catch (err) {
      const parsed = parseReportLoadError(err);
      if (parsed.subscriptionRequired) {
        setIsSubscriptionRequired(true);
        setError(null);
      } else {
        setError(parsed.message);
        setIsSubscriptionRequired(false);
      }
      console.error("Error loading report:", err);
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
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.payments/summary.title") },
        ]}
      >
        <ReportSkeleton />
      </SettingsDetailLayout>
    );
  }

  if (isSubscriptionRequired) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.payments/summary.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.payments/summary.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.payments/summary.title")} />
        </div>
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.payments/summary.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.payments/summary.unableToLoad")}
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
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.payments/summary.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title={t("web.provider.reports.pages.payments/summary.title")}
            subtitle={t("web.provider.reports.pages.payments/summary.subtitle")}
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
            <span className="hidden sm:inline">{t("web.provider.dataTableShell.export")}</span>
            <span className="sm:hidden">{t("web.provider.dataTableShell.export")}</span>
          </Button>
        </div>

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        {(data.reportBasis || data.timezone) && (
          <Alert className="border-sky-200 bg-sky-50 text-sky-950">
            <Info className="h-4 w-4 text-sky-800" />
            <div>
              <AlertTitle className="text-sky-950">{t("web.provider.reports.common.howThisReportIsBuilt")}</AlertTitle>
              <AlertDescription className="text-sky-950/90 space-y-1 text-sm leading-relaxed">
                {data.reportBasis ? <p>{data.reportBasis}</p> : null}
                {data.timezone ? (
                  <p className="text-xs text-sky-900/85">{t("web.provider.reports.common.providerTimezoneForRanges", { timezone: data.timezone })}</p>
                ) : null}
              </AlertDescription>
            </div>
          </Alert>
        )}

        {(data.cashStylePaymentsWithoutLedgerCount ?? 0) > 0 && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <Info className="h-4 w-4 text-amber-800" />
            <div>
              <AlertTitle className="text-amber-950">{t("web.provider.reports.pages.payments/summary.ledgerReconTitle")}</AlertTitle>
              <AlertDescription className="text-amber-950/90 space-y-1">
                <p>
                  {t("web.provider.reports.pages.payments/summary.cashStyle", {
                    count: data.cashStylePaymentsWithoutLedgerCount,
                    amount: fmt(data.cashStylePaymentsWithoutLedgerAmount ?? 0),
                  })}
                </p>
                <p className="text-sm">
                  {t("web.provider.reports.pages.payments/summary.cashStyleHint")}{" "}
                  <a className="underline font-medium" href="/provider/reports/payments/payouts">
                    {t("web.provider.reports.pages.payments/summary.payoutEarningsLink")}
                  </a>{" "}
                  {t("web.provider.reports.pages.payments/summary.cashStyleHintSuffix")}
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
                {t("web.provider.reports.pages.payments/summary.bookingsExclPending")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.totalPayments}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {t("web.provider.reports.pages.payments/summary.scheduledInRange")}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/summary.grossBookedValue")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(grossBookedValue)}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-2">{t("web.provider.reports.pages.payments/summary.grossBookedHint")}</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/summary.providerNetActivity")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-purple-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(providerNetActivity)}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-2">{t("web.provider.reports.pages.payments/summary.providerNetHint")}</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/summary.refundedLedger")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <ArrowDownRight className="w-5 h-5 text-red-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(data.refundedAmount)}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {t("web.provider.reports.pages.payments/summary.refundRateVsSettled", { rate: data.refundRate.toFixed(1) })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200 border-s-4 border-s-blue-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/summary.customerFundsSettled")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {fmt(settledLedgerAmount)}
              </p>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                {t("web.provider.reports.pages.payments/summary.customerFundsHint")}
              </p>
              {data.collectionBreakdown ? (
                <p className="text-[11px] text-gray-400 mt-3 font-mono leading-relaxed">
                  {t("web.provider.reports.pages.payments/summary.rawLedgerLines", {
                    payment: fmt(data.collectionBreakdown.ledger_payment_amount ?? 0),
                    wallet: fmt(data.collectionBreakdown.wallet ?? 0),
                    gift: fmt(data.collectionBreakdown.gift_card ?? 0),
                    addon:
                      data.collectionBreakdown.additional_charge_payment != null &&
                      data.collectionBreakdown.additional_charge_payment > 0
                        ? t("web.provider.reports.pages.payments/summary.addonCharges", {
                            amount: fmt(data.collectionBreakdown.additional_charge_payment),
                          })
                        : "",
                  })}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/summary.providerEarningsLedger")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {fmt(providerEarnings)}
              </p>
              <p className="text-xs text-gray-500 mt-2">{t("web.provider.reports.pages.payments/summary.providerEarningsHint")}</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/summary.paymentTransactionRows")}
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
                {t("web.provider.reports.pages.payments/summary.paymentTransactionHint", {
                  count: data.gatewayChargeCount ?? 0,
                })}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/summary.bookingPaymentFailed")}
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
                {t("web.provider.reports.pages.payments/summary.bookingPaymentFailedHint")}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/summary.avgGrossPerBooking")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(data.averageBookedValueNonPending ?? data.averageTransactionValue)}
                </p>
                <div className="p-2 bg-blue-50 rounded-lg">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {t("web.provider.reports.pages.payments/summary.avgGrossHint")}
              </p>
            </CardContent>
          </Card>
        </div>

        {data.basis ? (
          <Card className="border-gray-200 bg-gray-50">
            <CardContent className="pt-6">
              <div className="space-y-2 text-xs text-gray-600">
                {data.basis.grossBookedValue ? (
                  <p><strong>{t("web.provider.reports.pages.payments/summary.grossBookedLabel")}</strong> {data.basis.grossBookedValue}</p>
                ) : null}
                {data.basis.settledLedgerAmount ? (
                  <p><strong>{t("web.provider.reports.pages.payments/summary.settledLedgerLabel")}</strong> {data.basis.settledLedgerAmount}</p>
                ) : null}
                {data.basis.customerPaymentsByMethodTotal ? (
                  <p><strong>{t("web.provider.reports.pages.payments/summary.paymentMethodsLabel")}</strong> {data.basis.customerPaymentsByMethodTotal}</p>
                ) : null}
                {data.basis.providerNetActivity ? (
                  <p><strong>{t("web.provider.reports.pages.payments/summary.providerNetLabel")}</strong> {data.basis.providerNetActivity}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Payments by Method */}
        {data.paymentsByMethod && data.paymentsByMethod.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>{t("web.provider.reports.pages.payments/summary.paymentsByMethod")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.paymentsByMethod.map((method, index) => (
                <div
                  key={method.method}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-white font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {method.method.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-gray-600">
                        {t("web.provider.reports.pages.payments/summary.transactionsCount", { count: method.count })}
                      </p>
                    </div>
                  </div>
                  <div className="text-end">
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
              <CardTitle>{t("web.provider.reports.pages.payments/summary.paymentsByMethod")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                {t("web.provider.reports.pages.payments/summary.noPaymentMethodData")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Payments by Status */}
        {data.paymentsByStatus && data.paymentsByStatus.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>{t("web.provider.reports.pages.payments/summary.paymentsByStatus")}</CardTitle>
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
              <CardTitle>{t("web.provider.reports.pages.payments/summary.paymentsByStatus")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                {t("web.provider.reports.pages.payments/summary.noPaymentStatusData")}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
