"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, CreditCard, Link2, ShoppingBag, Unlink, CheckCircle, XCircle, AlertCircle, Download } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";
import type { YocoReconciliationResponse } from "@/app/api/provider/reports/payments/yoco-reconciliation/route";

export default function YocoReconciliationReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<YocoReconciliationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [dateRange, selectedLocationId]); // eslint-disable-line react-hooks/exhaustive-deps -- filters

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
      params.append("limit", "300");
      appendLocation(params);

      const response = await fetcher.get<{ data: YocoReconciliationResponse }>(
        `/api/provider/reports/payments/yoco-reconciliation?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading Yoco reconciliation:", err);
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
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Payments", href: "/provider/reports/payments/summary" },
          { label: "Yoco reconciliation" },
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
          { label: "Payments", href: "/provider/reports/payments/summary" },
          { label: "Yoco reconciliation" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load Yoco reconciliation data"}
        />
      </SettingsDetailLayout>
    );
  }

  const { payments, summary } = data;
  const tz = data.timezone ?? "";
  const rangeLabel = data.fromYmd && data.toYmd ? `${data.fromYmd} → ${data.toYmd}` : "";

  const linkLabel = (kind: string) => {
    if (kind === "booking") return "Booking";
    if (kind === "sale") return "Sale";
    return "Unlinked";
  };

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Payments", href: "/provider/reports/payments/summary" },
        { label: "Yoco reconciliation" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Yoco reconciliation"
          subtitle="Terminal captures in range vs booking_payments — spot missed webhooks on booking-linked charges"
          actions={
            <Button variant="outline" onClick={handleExport} disabled={payments.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          }
        />

        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} onReset={handleReset} />

        {data.reportBasis ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <p className="font-medium text-sky-950">What this report shows</p>
            <p className="mt-1 text-sky-950/95">{data.reportBasis}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-900/85">
              {tz ? <span>Timezone · {tz}</span> : null}
              {rangeLabel ? <span>Capture window · {rangeLabel}</span> : null}
              <span>Row cap · {data.limit}</span>
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
              <CardTitle className="text-sm font-medium text-gray-600">Rows returned</CardTitle>
              <CreditCard className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{summary.total}</div>
              <p className="mt-1 text-xs text-gray-500">Newest first (capped)</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Booking link</CardTitle>
              <Link2 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{summary.with_booking}</div>
              <p className="mt-1 text-xs text-gray-500">Eligible for sync check</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Synced</CardTitle>
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-emerald-700">{summary.synced}</div>
              <p className="mt-1 text-xs text-gray-500">booking_payments match</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Not synced</CardTitle>
              <XCircle className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-amber-800">{summary.not_synced}</div>
              <p className="mt-1 text-xs text-gray-500">Booking-linked gap</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Sale link only</CardTitle>
              <ShoppingBag className="h-4 w-4 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{summary.with_sale_only}</div>
              <p className="mt-1 text-xs text-gray-500">No booking sync column</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Unlinked</CardTitle>
              <Unlink className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-gray-900">{summary.unlinked}</div>
              <p className="mt-1 text-xs text-gray-500">No booking or sale id</p>
            </CardContent>
          </Card>
        </div>

        {summary.not_synced > 0 && (
          <Card className="border-amber-200 bg-amber-50/80 shadow-sm">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="text-sm leading-relaxed text-amber-950">
                  <span className="font-medium">{summary.not_synced}</span> booking-linked{" "}
                  {summary.not_synced === 1 ? "payment does" : "payments do"} not have a matching{" "}
                  <code className="rounded bg-amber-100/80 px-1 py-0.5 text-xs">booking_payments</code> row with{" "}
                  <code className="rounded bg-amber-100/80 px-1 py-0.5 text-xs">payment_provider=yoco</code> and the same
                  Yoco id — often a missed or delayed webhook, or a race before the booking payment row was written.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {data.basis ? (
          <Card className="border-violet-100 bg-violet-50/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-violet-950">Definitions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-violet-950/95">
              <p>
                <span className="font-medium">Source · </span>
                {data.basis.source}
              </p>
              <p>
                <span className="font-medium">Sync · </span>
                {data.basis.syncDefinition}
              </p>
              <p>
                <span className="font-medium">Amounts · </span>
                {data.basis.amountUnits}
              </p>
              <p>
                <span className="font-medium">Location · </span>
                {data.basis.locationFilter}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Yoco payments</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              Amounts shown in your default currency (from cents). Sync applies only to booking-linked rows.
            </p>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No Yoco payments in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-2 pr-4 text-left font-medium text-gray-700">Captured</th>
                      <th className="py-2 pr-4 text-left font-medium text-gray-700">Yoco ID</th>
                      <th className="py-2 pr-4 text-right font-medium text-gray-700">Amount</th>
                      <th className="py-2 pr-4 text-left font-medium text-gray-700">Status</th>
                      <th className="py-2 pr-4 text-left font-medium text-gray-700">Link</th>
                      <th className="py-2 text-left font-medium text-gray-700">Booking sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-2.5 pr-4 whitespace-nowrap text-gray-900">
                          {format(new Date(p.created_at), "MMM d, yyyy HH:mm")}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-xs text-gray-800">{p.yoco_payment_id}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-gray-900">
                          {fmt(Number(p.amount ?? 0) / 100)}
                        </td>
                        <td className="py-2.5 pr-4 capitalize text-gray-700">{p.status}</td>
                        <td className="py-2.5 pr-4 text-gray-700">{linkLabel(p.link_kind)}</td>
                        <td className="py-2.5">
                          {p.link_kind === "booking" ? (
                            p.booking_synced ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <CheckCircle className="h-4 w-4 shrink-0" /> Synced
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <XCircle className="h-4 w-4 shrink-0" /> Missing booking payment
                              </span>
                            )
                          ) : (
                            <span className="text-gray-500">—</span>
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
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
