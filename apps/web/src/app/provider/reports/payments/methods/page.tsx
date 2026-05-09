"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, CreditCard, Layers, DollarSign, AlertTriangle } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface PaymentMethodsMethodRow {
  method: string;
  label?: string;
  totalCount: number;
  totalAmount: number;
  paymentTransactionCount?: number;
  paymentTransactionAmount?: number;
  bookingPaymentCount?: number;
  bookingPaymentAmount?: number;
  walletBookingAdjustmentCount?: number;
  walletBookingAdjustmentAmount?: number;
  averageAmount: number;
  percentage: number;
}

interface PaymentMethodsData {
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  reportBasis?: string;
  totalLineItems?: number;
  totalPayments?: number;
  totalAmount: number;
  methods: PaymentMethodsMethodRow[];
  diagnostics?: {
    failedCaptureAttemptsInRange?: number;
    failedCaptureAttemptsAttributed?: number;
  };
}

export default function PaymentMethodsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<PaymentMethodsData | null>(null);
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

      const response = await fetcher.get<{ data: PaymentMethodsData }>(
        `/api/provider/reports/payments/methods?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading payment methods:", err);
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
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "payment-methods", exportCurrency);
    exportToCSV(exportData, "payment-methods-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Payment Methods" },
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
          { label: "Payment Methods" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load payment methods data"}
        />
      </SettingsDetailLayout>
    );
  }

  const totalLineItems = data.totalLineItems ?? data.totalPayments ?? 0;
  const tz = data.timezone ?? "";
  const rangeLabel =
    data.fromYmd && data.toYmd ? `${data.fromYmd} → ${data.toYmd}` : "";
  const failedTotal = data.diagnostics?.failedCaptureAttemptsInRange ?? 0;
  const failedAttrib = data.diagnostics?.failedCaptureAttemptsAttributed ?? 0;

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Payment Methods" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Payment Methods"
          subtitle="How customer funds were captured in the selected settlement window — gateways, till logs, and wallet splits"
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

        {data.reportBasis ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <p className="font-medium text-sky-950">What this report counts</p>
            <p className="mt-1 text-sky-950/95">{data.reportBasis}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-900/85">
              {tz ? <span>Timezone · {tz}</span> : null}
              {rangeLabel ? <span>Range · {rangeLabel}</span> : null}
            </div>
          </div>
        ) : null}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Settlement line items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{totalLineItems}</p>
                <Layers className="w-5 h-5 text-indigo-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Rows from payment captures and completed till logs in range (plus wallet split adjustments where applicable).
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total attributed amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalAmount)}</p>
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Sum of amounts by method; attribution uses capture timestamps, not appointment dates.
              </p>
            </CardContent>
          </Card>
        </div>

        {failedTotal > 0 ? (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-medium">Failed gateway captures in this window</p>
              <p className="mt-1 text-amber-950/90">
                {failedTotal} failed payment_transaction rows with capture timestamps in range
                {failedAttrib != null ? (
                  <>
                    {" "}
                    ({failedAttrib} linked to a booking at this provider
                    {selectedLocationId ? " and location" : ""}).
                  </>
                ) : null}{" "}
                These are attempts, not settled customer funds — excluded from method totals above.
              </p>
            </div>
          </div>
        ) : null}

        {/* Payment Methods Breakdown */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Breakdown by method</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              Each row can combine gateway captures (Paystack, Yoco, …), till logs (booking_payments), and wallet split
              adjustments.
            </p>
          </CardHeader>
          <CardContent>
            {data.methods.length === 0 ? (
              <EmptyReportState
                title="No payment activity"
                description="No settled or logged payments matched this window and filters."
              />
            ) : (
              <div className="space-y-3">
                {data.methods.map((method) => {
                  const label = method.label ?? method.method;
                  const ptN = method.paymentTransactionCount ?? 0;
                  const bpN = method.bookingPaymentCount ?? 0;
                  const wN = method.walletBookingAdjustmentCount ?? 0;
                  return (
                    <div
                      key={method.method}
                      className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-100/80"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="font-semibold text-gray-900">{label}</p>
                            <span className="shrink-0 text-sm tabular-nums text-gray-600">
                              {method.percentage.toFixed(1)}%
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-gray-500">
                            {ptN > 0 ? (
                              <span>
                                {ptN} gateway/settlement row{ptN === 1 ? "" : "s"}
                                {method.paymentTransactionAmount != null && method.paymentTransactionAmount > 0
                                  ? ` · ${fmt(method.paymentTransactionAmount)}`
                                  : ""}
                              </span>
                            ) : null}
                            {ptN > 0 && (bpN > 0 || wN > 0) ? <span> · </span> : null}
                            {bpN > 0 ? (
                              <span>
                                {bpN} till / manual log{bpN === 1 ? "" : "s"}
                                {method.bookingPaymentAmount != null && method.bookingPaymentAmount > 0
                                  ? ` · ${fmt(method.bookingPaymentAmount)}`
                                  : ""}
                              </span>
                            ) : null}
                            {(ptN > 0 || bpN > 0) && wN > 0 ? <span> · </span> : null}
                            {wN > 0 ? (
                              <span>
                                {wN} wallet split adjustment{wN === 1 ? "" : "s"}
                                {method.walletBookingAdjustmentAmount != null && method.walletBookingAdjustmentAmount > 0
                                  ? ` · ${fmt(method.walletBookingAdjustmentAmount)}`
                                  : ""}
                              </span>
                            ) : null}
                            {ptN === 0 && bpN === 0 && wN === 0 ? (
                              <span>{method.totalCount} line item{method.totalCount === 1 ? "" : "s"}</span>
                            ) : null}
                          </p>
                        </div>
                        <div className="text-right sm:pl-4">
                          <p className="text-lg font-semibold tabular-nums text-gray-900">{fmt(method.totalAmount)}</p>
                          <p className="text-xs text-gray-500">
                            Avg {fmt(method.averageAmount)} · {method.totalCount} line item
                            {method.totalCount === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width]"
                          style={{ width: `${Math.min(100, Math.max(0, method.percentage))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
