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
import { RefreshCw, CreditCard, Link2, ShoppingBag, Unlink, CheckCircle, XCircle, AlertCircle, Download } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";
import type { YocoReconciliationResponse } from "@/app/api/provider/reports/payments/yoco-reconciliation/route";

export default function YocoReconciliationReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { t } = useTranslation();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<YocoReconciliationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadReport();
  }, [dateRange, selectedLocationId]); // eslint-disable-line react-hooks/exhaustive-deps -- filters

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);

      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      params.append("limit", "300");
      appendLocation(params);

      const response = await fetcher.get<{ data: YocoReconciliationResponse }>(
        `/api/provider/reports/payments/yoco-reconciliation?${params.toString()}`
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

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "yoco-reconciliation", exportCurrency);
    exportToCSV(exportData, "yoco-reconciliation-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.breadcrumb.payments"), href: "/provider/reports/payments/summary" },
          { label: t("web.provider.reports.pages.payments/yoco-reconciliation.title") },
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
          { label: t("web.provider.reports.pages.payments/yoco-reconciliation.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.payments/yoco-reconciliation.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.payments/yoco-reconciliation.title")} />
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
          { label: t("web.provider.breadcrumb.payments"), href: "/provider/reports/payments/summary" },
          { label: t("web.provider.reports.pages.payments/yoco-reconciliation.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.payments/yoco-reconciliation.unableToLoad")}
        />
      </SettingsDetailLayout>
    );
  }

  const { payments, summary } = data;
  const tz = data.timezone ?? "";
  const rangeLabel = data.fromYmd && data.toYmd ? `${data.fromYmd} → ${data.toYmd}` : "";

  const linkLabel = (kind: string) => {
    if (kind === "booking") return t("web.provider.reports.pages.payments/yoco-reconciliation.booking");
    if (kind === "sale") return t("web.provider.reports.pages.payments/yoco-reconciliation.sale");
    return t("web.provider.reports.pages.payments/yoco-reconciliation.unlinked");
  };

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.breadcrumb.payments"), href: "/provider/reports/payments/summary" },
        { label: t("web.provider.reports.pages.payments/yoco-reconciliation.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.payments/yoco-reconciliation.title")}
          subtitle={t("web.provider.reports.pages.payments/yoco-reconciliation.subtitle")}
          actions={
            <Button variant="outline" onClick={handleExport} disabled={payments.length === 0}>
              <Download className="me-2 h-4 w-4" />
              {t("web.provider.common.exportCsv")}
            </Button>
          }
        />

        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} onReset={handleReset} />

        {data.reportBasis ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <p className="font-medium text-sky-950">{t("web.provider.reports.pages.payments/yoco-reconciliation.whatThisShows")}</p>
            <p className="mt-1 text-sky-950/95">{data.reportBasis}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-900/85">
              {tz ? <span>{t("web.provider.reports.common.timezoneDot", { tz })}</span> : null}
              {rangeLabel ? <span>{t("web.provider.reports.pages.payments/yoco-reconciliation.captureWindow", { range: rangeLabel })}</span> : null}
              <span>{t("web.provider.reports.pages.payments/yoco-reconciliation.rowCap", { limit: data.limit })}</span>
            </div>
          </div>
        ) : null}

        {data.note ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
            {data.note}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/yoco-reconciliation.rowsReturned")}</CardTitle>
              <CreditCard className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{summary.total}</div>
              <p className="mt-1 text-xs text-gray-500">{t("web.provider.reports.pages.payments/yoco-reconciliation.newestFirst")}</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/yoco-reconciliation.bookingLink")}</CardTitle>
              <Link2 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{summary.with_booking}</div>
              <p className="mt-1 text-xs text-gray-500">{t("web.provider.reports.pages.payments/yoco-reconciliation.eligibleForSync")}</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/yoco-reconciliation.synced")}</CardTitle>
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-emerald-700">{summary.synced}</div>
              <p className="mt-1 text-xs text-gray-500">{t("web.provider.reports.pages.payments/yoco-reconciliation.bookingPaymentsMatch")}</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/yoco-reconciliation.notSynced")}</CardTitle>
              <XCircle className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-amber-800">{summary.not_synced}</div>
              <p className="mt-1 text-xs text-gray-500">{t("web.provider.reports.pages.payments/yoco-reconciliation.bookingLinkedGap")}</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/yoco-reconciliation.saleLinkOnly")}</CardTitle>
              <ShoppingBag className="h-4 w-4 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{summary.with_sale_only}</div>
              <p className="mt-1 text-xs text-gray-500">{t("web.provider.reports.pages.payments/yoco-reconciliation.noBookingSyncColumn")}</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.payments/yoco-reconciliation.unlinked")}</CardTitle>
              <Unlink className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{summary.unlinked}</div>
              <p className="mt-1 text-xs text-gray-500">{t("web.provider.reports.pages.payments/yoco-reconciliation.noBookingOrSale")}</p>
            </CardContent>
          </Card>
        </div>

        {summary.not_synced > 0 && (
          <Card className="border-amber-200 bg-amber-50/80 shadow-sm">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="text-sm leading-relaxed text-amber-950">
                  {t("web.provider.reports.pages.payments/yoco-reconciliation.gap", { count: summary.not_synced })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {data.basis ? (
          <Card className="border-violet-100 bg-violet-50/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-violet-950">{t("web.provider.reports.common.definitions")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-violet-950/95">
              <p>
                <span className="font-medium">{t("web.provider.reports.pages.payments/yoco-reconciliation.source")}</span>
                {data.basis.source}
              </p>
              <p>
                <span className="font-medium">{t("web.provider.reports.pages.payments/yoco-reconciliation.sync")}</span>
                {data.basis.syncDefinition}
              </p>
              <p>
                <span className="font-medium">{t("web.provider.reports.pages.payments/yoco-reconciliation.amounts")}</span>
                {data.basis.amountUnits}
              </p>
              <p>
                <span className="font-medium">{t("web.provider.reports.pages.payments/yoco-reconciliation.location")}</span>
                {data.basis.locationFilter}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t("web.provider.reports.pages.payments/yoco-reconciliation.yocoPayments")}</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              {t("web.provider.reports.pages.payments/yoco-reconciliation.yocoPaymentsHint")}
            </p>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">{t("web.provider.reports.pages.payments/yoco-reconciliation.noPayments")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 pe-4 text-start font-medium text-gray-700">{t("web.provider.reports.pages.payments/yoco-reconciliation.captured")}</th>
                      <th className="py-2 pe-4 text-start font-medium text-gray-700">{t("web.provider.reports.pages.payments/yoco-reconciliation.yocoId")}</th>
                      <th className="py-2 pe-4 text-end font-medium text-gray-700">{t("web.provider.reports.pages.payments/yoco-reconciliation.amount")}</th>
                      <th className="py-2 pe-4 text-start font-medium text-gray-700">{t("web.provider.reports.pages.payments/yoco-reconciliation.status")}</th>
                      <th className="py-2 pe-4 text-start font-medium text-gray-700">{t("web.provider.reports.pages.payments/yoco-reconciliation.link")}</th>
                      <th className="py-2 text-start font-medium text-gray-700">{t("web.provider.reports.pages.payments/yoco-reconciliation.bookingSync")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-2.5 pe-4 whitespace-nowrap text-gray-900">
                          {format(new Date(p.created_at), "MMM d, yyyy HH:mm")}
                        </td>
                        <td className="py-2.5 pe-4 font-mono text-xs text-gray-800">{p.yoco_payment_id}</td>
                        <td className="py-2.5 pe-4 text-end tabular-nums text-gray-900">
                          {fmt(Number(p.amount ?? 0) / 100)}
                        </td>
                        <td className="py-2.5 pe-4 capitalize text-gray-700">{p.status}</td>
                        <td className="py-2.5 pe-4 text-gray-700">{linkLabel(p.link_kind)}</td>
                        <td className="py-2.5">
                          {p.link_kind === "booking" ? (
                            p.booking_synced ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <CheckCircle className="h-4 w-4 shrink-0" /> {t("web.provider.reports.pages.payments/yoco-reconciliation.synced")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <XCircle className="h-4 w-4 shrink-0" /> {t("web.provider.reports.pages.payments/yoco-reconciliation.missingBookingPayment")}
                              </span>
                            )
                          ) : (
                            <span className="text-gray-500">{t("web.provider.common.emDash")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => void loadReport()} disabled={isLoading}>
            <RefreshCw className="me-2 h-4 w-4" />
            {t("web.provider.portal.waitingRoom.refresh")}
          </Button>
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
