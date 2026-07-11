"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, DollarSign, Layers, Wallet, Percent } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface PayoutsData {
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  reportBasis?: string;
  basis?: {
    headlineTotal?: string;
    bookedAmount?: string;
    payoutAmountPerRow?: string;
    platformFeesAndRefunds?: string;
    notIncluded?: string;
  };
  totalPayouts: number;
  totalPayoutAmount: number;
  totalGrossAmount: number;
  totalBookedAmount?: number;
  totalBookedNetOfRefunds?: number;
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
    bookingId?: string | null;
    productOrderId?: string;
    grossAmount: number;
    bookedAmount?: number;
    bookedNetOfRefunds?: number;
    refundedAmount: number;
    netAmount: number;
    platformFee: number;
    payoutAmount: number;
    createdAt: string;
    ledgerSettlementAt?: string;
    referenceLabel?: string;
  }>;
}

export default function PayoutsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });
  const [data, setData] = useState<PayoutsData | null>(null);
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
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "payouts", exportCurrency);
    exportToCSV(exportData, "payouts-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Payout earnings" },
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
          { label: "Payout earnings" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load payouts data"}
        />
      </SettingsDetailLayout>
    );
  }

  const totalBookedAmount = data.totalBookedAmount ?? data.totalGrossAmount;
  const totalBookedNetOfRefunds =
    data.totalBookedNetOfRefunds ??
    Math.max(0, totalBookedAmount - (data.totalRefunded ?? 0));
  const feeRatePct = Number(data.platformFeeRate ?? 0);
  const tz = data.timezone ?? "";
  const rangeLabel = data.fromYmd && data.toYmd ? `${data.fromYmd} → ${data.toYmd}` : "";

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Payout earnings" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Payout earnings (ledger)"
          subtitle="Platform-held provider earnings from the ledger in this settlement window — not bank transfers"
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
              {rangeLabel ? <span>Ledger window · {rangeLabel}</span> : null}
            </div>
          </div>
        ) : null}

        {data.basis ? (
          <Card className="border-violet-100 bg-violet-50/40 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-violet-950">Definitions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-violet-950/95">
              {data.basis.headlineTotal ? (
                <p>
                  <span className="font-medium">Headline total · </span>
                  {data.basis.headlineTotal}
                </p>
              ) : null}
              {data.basis.bookedAmount ? (
                <p>
                  <span className="font-medium">Booked amount · </span>
                  {data.basis.bookedAmount}
                </p>
              ) : null}
              {data.basis.payoutAmountPerRow ? (
                <p>
                  <span className="font-medium">Earnings per row · </span>
                  {data.basis.payoutAmountPerRow}
                </p>
              ) : null}
              {data.basis.platformFeesAndRefunds ? (
                <p>
                  <span className="font-medium">Fees & refunds · </span>
                  {data.basis.platformFeesAndRefunds}
                </p>
              ) : null}
              {data.basis.notIncluded ? (
                <p className="text-violet-900/90">
                  <span className="font-medium">Not included · </span>
                  {data.basis.notIncluded}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Ledger rows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalPayouts}</p>
                <Layers className="h-5 w-5 text-indigo-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Bookings or retail orders with provider earnings in this window.
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Net provider earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalPayoutAmount)}</p>
                <Wallet className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500">Sum of provider_earnings in the settlement period.</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Booked net of refunds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(totalBookedNetOfRefunds)}</p>
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500">Customer booked totals minus refund ledger rows matched here.</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg per row</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.averagePayout)}</p>
                <Percent className="h-5 w-5 text-purple-600" />
              </div>
              <p className="mt-2 text-xs text-gray-500">Mean net earnings across rows above.</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Gross booked value</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(totalBookedAmount)}</p>
              <p className="mt-1 text-xs text-gray-500">Booking/order totals for linked ledger rows (not appointment filter).</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Platform & service fees</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalPlatformFees)}</p>
              <p className="mt-1 text-xs text-gray-500">
                Ledger fees in window vs booked gross:{" "}
                <span className="font-medium tabular-nums">{feeRatePct.toFixed(1)}%</span>
              </p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Refunds (ledger)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalRefunded)}</p>
              <p className="mt-1 text-xs text-gray-500">Refund rows matched to the same bookings or orders.</p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Breakdown */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Ledger earnings by month</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              Amounts roll up by calendar month in your timezone from daily ledger totals. Row counts use settlement
              month per booking or order.
            </p>
          </CardHeader>
          <CardContent>
            {data.monthlyBreakdown.length === 0 ? (
              <EmptyReportState title="No activity" description="No ledger earnings in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.monthlyBreakdown.map((item) => {
                  const [year, month] = item.month.split("-");
                  const monthName = new Date(parseInt(year, 10), parseInt(month, 10) - 1).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <div
                      key={item.month}
                      className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-100/80"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{monthName}</p>
                        <p className="text-sm text-gray-600">{item.count} rows with earnings</p>
                      </div>
                      <p className="font-semibold tabular-nums text-gray-900">{fmt(item.amount)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Recent rows</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              Sorted by latest ledger settlement in this window (not appointment date).
            </p>
          </CardHeader>
          <CardContent>
            {data.recentPayouts.length === 0 ? (
              <EmptyReportState title="No rows" description="No matching ledger earnings." />
            ) : (
              <div className="space-y-3">
                {data.recentPayouts.map((payout) => {
                  const when = payout.ledgerSettlementAt ?? payout.createdAt;
                  const key =
                    payout.bookingId || payout.productOrderId || payout.createdAt;
                  return (
                    <div
                      key={String(key)}
                      className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-100/80 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">
                          {payout.referenceLabel ??
                            (payout.productOrderId ? "Retail order" : "Booking")}
                        </p>
                        <p className="text-xs text-gray-500">
                          Settled {format(new Date(when), "MMM d, yyyy · HH:mm")}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          Booked {fmt(payout.bookedAmount ?? payout.grossAmount)} · Fees {fmt(payout.platformFee)}
                          {payout.refundedAmount > 0 ? (
                            <> · Refunds {fmt(payout.refundedAmount)}</>
                          ) : null}
                        </p>
                      </div>
                      <div className="text-right sm:shrink-0">
                        <p className="font-semibold tabular-nums text-emerald-700">{fmt(payout.payoutAmount)}</p>
                        <p className="text-xs text-gray-500">net earnings</p>
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
