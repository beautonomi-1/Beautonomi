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
  RefreshCw,
  DollarSign,
  AlertTriangle,
  TrendingDown,
  Info,
  Wallet,
  Percent,
} from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ProviderRefundsReportResponse } from "@/app/api/provider/reports/payments/refunds/route";

const METHOD_LABEL_KEYS: Record<string, string> = {
  ledger: "web.provider.reports.pages.payments/refunds.methodLedger",
  product_order: "web.provider.reports.pages.payments/refunds.methodProductOrder",
  paystack: "web.provider.reports.pages.payments/refunds.methodPaystack",
  yoco: "web.provider.reports.pages.payments/refunds.methodYoco",
  stripe: "web.provider.reports.pages.payments/refunds.methodStripe",
  cash: "web.provider.reports.pages.payments/refunds.methodCash",
  card: "web.provider.reports.pages.payments/refunds.methodCard",
  wallet: "web.provider.reports.pages.payments/refunds.methodWallet",
  bank_transfer: "web.provider.reports.pages.payments/refunds.methodBankTransfer",
  other: "web.provider.reports.pages.payments/refunds.methodOther",
};

type RefundsData = ProviderRefundsReportResponse;

export default function RefundsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { t } = useTranslation();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const formatMethodLabel = (m: string) =>
    METHOD_LABEL_KEYS[m] ? t(METHOD_LABEL_KEYS[m]) : m.replace(/_/g, " ");
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<RefundsData | null>(null);
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

      const response = await fetcher.get<{ data: RefundsData }>(
        `/api/provider/reports/payments/refunds?${params.toString()}`,
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("web.provider.common.failedToLoadReport"));
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
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.payments/refunds.title") },
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
          { label: t("web.provider.reports.pages.payments/refunds.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.payments/refunds.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.payments/refunds.title")} />
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
          { label: t("web.provider.reports.pages.payments/refunds.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.payments/refunds.unableToLoad")}
        />
      </SettingsDetailLayout>
    );
  }

  const share = data.refundShareOfPaymentLedgerPercent ?? data.refundRate ?? 0;
  const payDenom = data.totalPaymentLedgerAmount ?? data.totalPaymentAmount ?? 0;

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.payments/refunds.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.payments/refunds.title")}
          subtitle={t("web.provider.reports.pages.payments/refunds.subtitle")}
          actions={
            <Button variant="outline" onClick={handleExport} className="min-h-[44px]">
              <Download className="w-4 h-4 me-2" />
              {t("web.provider.dataTableShell.export")}
            </Button>
          }
        />

        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} onReset={handleReset} />

        <Alert className="border-sky-200 bg-sky-50 text-sky-950">
          <Info className="h-4 w-4 text-sky-800" />
          <div>
            <AlertTitle className="text-sky-950">{t("web.provider.reports.pages.payments/refunds.howToRead")}</AlertTitle>
            <AlertDescription className="text-sky-950/90 space-y-2 text-sm leading-relaxed">
              <p>{data.reportBasis}</p>
              {data.timezone ? (
                <p className="text-xs text-sky-900/85">
                  {t("web.provider.reports.pages.payments/refunds.datesBucket", { timezone: data.timezone })}
                </p>
              ) : null}
            </AlertDescription>
          </div>
        </Alert>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <Card className="border-gray-200 border-s-4 border-s-rose-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/refunds.refundLedgerRows")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalRefunds}</p>
                <RefreshCw className="w-5 h-5 shrink-0 text-rose-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {t("web.provider.reports.pages.payments/refunds.refundLedgerHint")}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/refunds.customerRefundGross")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalRefundAmount)}</p>
                <DollarSign className="w-5 h-5 shrink-0 text-red-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">{t("web.provider.reports.pages.payments/refunds.customerRefundHint")}</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/refunds.providerReversal")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">
                  {fmt(data.providerEarningsReversed)}
                </p>
                <Wallet className="w-5 h-5 shrink-0 text-violet-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">{t("web.provider.reports.pages.payments/refunds.providerReversalHint")}</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/refunds.paymentLedgerDenom")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(payDenom)}</p>
                <Percent className="w-5 h-5 shrink-0 text-slate-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {t("web.provider.reports.pages.payments/refunds.paymentLedgerHint")}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/refunds.refundDivPayment")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{share.toFixed(2)}%</p>
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">{t("web.provider.reports.pages.payments/refunds.refundDivHint")}</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/refunds.avgRefund")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.averageRefundAmount)}</p>
                <TrendingDown className="w-5 h-5 shrink-0 text-gray-600" />
              </div>
              <p className="text-xs text-gray-500 mt-2">{t("web.provider.reports.pages.payments/refunds.avgRefundHint")}</p>
            </CardContent>
          </Card>
        </div>

        {/* Refunds by Method */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>{t("web.provider.reports.pages.payments/refunds.byRefundPath")}</CardTitle>
            <p className="text-sm text-gray-500 font-normal mt-1">
              {t("web.provider.reports.pages.payments/refunds.byRefundPathHint")}
            </p>
          </CardHeader>
          <CardContent>
            {data.methodBreakdown.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.payments/refunds.noRefunds")} description={t("web.provider.reports.pages.payments/refunds.noRefundsDesc")} />
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
                        {t("web.provider.reports.pages.payments/refunds.ofRefundGross", {
                          pct: method.percentage.toFixed(1),
                          count: method.count,
                        })}
                      </p>
                    </div>
                    <div className="text-end">
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
              <CardTitle>{t("web.provider.reports.pages.payments/refunds.byDay")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.dailyBreakdown.map((d) => (
                  <div key={d.date} className="rounded-xl border border-gray-100 bg-white p-4">
                    <p className="text-xs font-medium text-gray-500">{d.date}</p>
                    <p className="text-lg font-semibold tabular-nums text-gray-900 mt-1">{fmt(d.amount)}</p>
                    <p className="text-xs text-gray-500">{t("web.provider.reports.pages.payments/refunds.rowsCount", { count: d.count })}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Recent Refunds */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>{t("web.provider.reports.pages.payments/refunds.recentRefundRows")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentRefunds.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.payments/refunds.noRefunds")} description={t("web.provider.reports.pages.payments/refunds.noRefundsDesc")} />
            ) : (
              <div className="space-y-3">
                {data.recentRefunds.map((refund) => (
                  <div
                    key={refund.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 rounded-xl border border-gray-100 bg-white"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {refund.paymentMethodLabel ? formatMethodLabel(refund.paymentMethodLabel) : t("web.provider.reports.pages.payments/refunds.ledger")}
                        {refund.booking_id ? (
                          <span className="text-xs font-normal text-gray-500 ms-2">{t("web.provider.reports.pages.payments/refunds.bookingLinked")}</span>
                        ) : null}
                        {refund.product_order_id ? (
                          <span className="text-xs font-normal text-gray-500 ms-2">{t("web.provider.reports.pages.payments/refunds.orderLinked")}</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(refund.created_at), "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                      {refund.reason ? <p className="text-xs text-gray-500 mt-1 line-clamp-2">{refund.reason}</p> : null}
                    </div>
                    <div className="text-end">
                      <p className="font-semibold tabular-nums text-red-700">{fmt(refund.amount)}</p>
                      <p className="text-xs text-gray-500">{t("web.provider.reports.pages.payments/refunds.customerRefundGrossLabel")}</p>
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
