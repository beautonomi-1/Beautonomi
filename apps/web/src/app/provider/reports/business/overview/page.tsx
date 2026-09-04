"use client";

import React, { useState, useEffect } from "react";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download,
  DollarSign,
  Calendar,
  Users,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Info,
} from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface BusinessOverviewData {
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  period: string;
  reportBasis?: string;
  basis?: Record<string, string>;
  totalRevenue: number;
  ledgerEarningsFromBookings?: number;
  ledgerEarningsFromProductOrders?: number;
  cancellationFees?: number;
  tipsTotal?: number;
  additionalChargesTotal?: number;
  netRevenue: number;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  noShows: number;
  uniqueClients: number;
  totalStaff: number;
  totalPayments: number;
  successfulPayments: number;
  totalRefunded: number;
  averageBookingValue: number;
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
  revenueGrowth: number;
  revenueGrowthIsNew?: boolean;
  locationAttribution?: { scopedByLocation?: boolean; excludedUnattributedRows?: number; note?: string };
}

const PERIOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "week", label: "Week to date" },
  { value: "month", label: "Month to date" },
  { value: "quarter", label: "Quarter to date" },
  { value: "year", label: "Year to date" },
];

const BASIS_LABELS: Record<string, string> = {
  calendar: "Calendar window",
  bookings: "Bookings",
  ledgerHeadline: "Ledger headline",
  ledgerSplit: "Ledger split check",
  avgBookingValue: "Avg per booking",
  payments: "Payments query",
  netRevenue: "Net revenue",
  growth: "Growth",
  staff: "Staff count",
};

export default function BusinessOverviewReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<BusinessOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadReport();
  }, [period, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append("period", period);
      appendLocation(params);

      const response = await fetcher.get<{ data: BusinessOverviewData }>(
        `/api/provider/reports/business/overview?${params.toString()}`,
        { timeoutMs: 120_000 },
      );
      setData(response.data);
    } catch (err) {
      if (err instanceof FetchError && err.code === "SUBSCRIPTION_REQUIRED") {
        setIsSubscriptionRequired(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load report");
        setIsSubscriptionRequired(false);
      }
      console.error("Error loading business overview:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "business-overview", exportCurrency);
    exportToCSV(exportData, "business-overview-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Business Overview" },
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
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Business Overview" },
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title="Business Overview"
            subtitle="Ledger + scheduled bookings — period to date"
          />
          <SubscriptionGate
            feature="Business Overview Reports"
            message="Reports require a subscription upgrade."
            upgradeMessage="Upgrade your platform plan under Subscription to access business analytics."
          />
        </div>
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
          { label: "Business Overview" },
        ]}
      >
        <EmptyReportState title="Failed to load report" description={error || "Unable to load business overview data"} />
      </SettingsDetailLayout>
    );
  }

  const basisText = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];
  const lb = Number(data.ledgerEarningsFromBookings ?? 0);
  const lo = Number(data.ledgerEarningsFromProductOrders ?? 0);
  const showLedgerSplit = lb > 0 && lo > 0;

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Business Overview" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Business Overview"
          subtitle="Facts from ledger settlement dates + bookings by scheduled time"
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data.fromYmd && data.toYmd ? (
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-800">{data.fromYmd}</span>
              <span className="mx-1">→</span>
              <span className="font-medium text-gray-800">{data.toYmd}</span>
              {data.timezone ? <span className="text-gray-500"> · {data.timezone}</span> : null}
            </p>
          ) : null}
        </div>

        {basisText ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/95 px-4 py-3 text-sm text-sky-950">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 text-sky-700 mt-0.5" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">What this report counts</p>
                <p className="mt-2 leading-relaxed">{basisText}</p>
              </div>
            </div>
          </div>
        ) : null}

        {basisEntries.length > 0 ? (
          <div className="rounded-xl border border-violet-100 bg-violet-50/90 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-900">Definitions</p>
            <ul className="mt-2 space-y-2 text-sm text-violet-950">
              {basisEntries.map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium">{BASIS_LABELS[k] ?? k} · </span>
                  {v}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Primary KPIs — ledger is headline, not booking.total_amount */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-emerald-100 bg-emerald-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-emerald-900">Ledger earnings</CardTitle>
              <p className="text-xs font-normal text-emerald-800/90">provider_earnings · settlement window</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-emerald-950">{fmt(data.totalRevenue)}</p>
                  <div className="mt-1 flex items-center gap-1">
                    {data.revenueGrowthIsNew ? (
                      <>
                        <TrendingUp className="h-4 w-4 text-emerald-700" />
                        <p className="text-xs text-emerald-700">New vs prior window</p>
                      </>
                    ) : data.revenueGrowth === 0 ? (
                      <p className="text-xs text-gray-500">0% vs prior window</p>
                    ) : (
                      <>
                        {data.revenueGrowth > 0 ? (
                          <TrendingUp className="h-4 w-4 text-green-700" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                        <p className={`text-xs ${data.revenueGrowth > 0 ? "text-green-700" : "text-red-600"}`}>
                          {data.revenueGrowth > 0 ? "+" : ""}
                          {data.revenueGrowth.toFixed(1)}% vs prior window
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <DollarSign className="h-8 w-8 shrink-0 text-emerald-600 opacity-90" />
              </div>
              {showLedgerSplit ? (
                <p className="mt-2 text-xs leading-snug text-emerald-900/85">
                  Bookings {fmt(lb)} · Product orders {fmt(lo)}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-700">Scheduled bookings</CardTitle>
              <p className="text-xs font-normal text-gray-500">scheduled_at in range · all statuses</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalBookings}</p>
                <Calendar className="h-8 w-8 text-blue-600 opacity-90" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-700">Distinct clients</CardTitle>
              <p className="text-xs font-normal text-gray-500">Unique customer_id on those bookings</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.uniqueClients}</p>
                <Users className="h-8 w-8 text-purple-600 opacity-90" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-700">Avg ledger / booking</CardTitle>
              <p className="text-xs font-normal text-gray-500">Among bookings with earnings rows only</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.averageBookingValue)}</p>
                <TrendingUp className="h-8 w-8 text-orange-600 opacity-90" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-700">Completion rate</CardTitle>
              <p className="text-xs text-gray-500">completed ÷ all scheduled in window</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.completionRate.toFixed(1)}%</p>
                <CheckCircle className="h-8 w-8 text-green-600 opacity-90" />
              </div>
              <p className="mt-1 text-xs text-gray-500">{data.completedBookings} completed</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-700">Cancellation rate</CardTitle>
              <p className="text-xs text-gray-500">cancelled ÷ all scheduled in window</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.cancellationRate.toFixed(1)}%</p>
                <XCircle className="h-8 w-8 text-red-600 opacity-90" />
              </div>
              <p className="mt-1 text-xs text-gray-500">{data.cancelledBookings} cancelled</p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-700">No-show rate</CardTitle>
              <p className="text-xs text-gray-500">no_show ÷ all scheduled in window</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.noShowRate.toFixed(1)}%</p>
                <XCircle className="h-8 w-8 text-amber-600 opacity-90" />
              </div>
              <p className="mt-1 text-xs text-gray-500">{data.noShows} no-shows</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Financial detail</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              Net combines headline ledger earnings with cancellation fees and subtracts refunds (tips tracked separately).
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
                <p className="text-sm text-gray-600">Net after refunds & fees</p>
                <p className="text-xl font-semibold tabular-nums text-gray-900">{fmt(data.netRevenue)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-sm text-gray-600">Refunds (ledger)</p>
                <p className="text-xl font-semibold tabular-nums text-red-600">{fmt(data.totalRefunded)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-sm text-gray-600">Cancellation fees retained</p>
                <p className="text-xl font-semibold tabular-nums text-amber-800">
                  {fmt(data.cancellationFees ?? 0)}
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-sm text-gray-600">Tips (ledger rows)</p>
                <p className="text-xl font-semibold tabular-nums text-gray-900">{fmt(data.tipsTotal ?? 0)}</p>
              </div>
            </div>
            {(data.additionalChargesTotal ?? 0) !== 0 ? (
              <p className="mt-3 text-xs text-gray-600">
                Additional charges / payments (ledger): {fmt(data.additionalChargesTotal ?? 0)}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Payments & operations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-sm text-gray-600">Booking payments captured</p>
                <p className="text-xl font-semibold text-green-700">
                  {data.successfulPayments} / {data.totalPayments}
                </p>
                <p className="mt-1 text-xs text-gray-500">Succeeded or completed statuses · scoped to bookings above</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-sm text-gray-600">Staff profiles</p>
                <p className="text-xl font-semibold text-gray-900">{data.totalStaff}</p>
                <p className="mt-1 text-xs text-gray-500">Provider-wide · not filtered by location</p>
              </div>
              {data.locationAttribution?.scopedByLocation ? (
                <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-4">
                  <p className="text-sm font-medium text-amber-950">Location scope</p>
                  <p className="mt-1 text-xs text-amber-950/90">{data.locationAttribution.note}</p>
                  {typeof data.locationAttribution.excludedUnattributedRows === "number" &&
                  data.locationAttribution.excludedUnattributedRows > 0 ? (
                    <p className="mt-2 text-xs text-amber-900">
                      Unattributed rows excluded: {data.locationAttribution.excludedUnattributedRows}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
