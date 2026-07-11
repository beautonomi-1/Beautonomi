"use client";

import React, { useState, useEffect } from "react";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, TrendingDown, Info } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface PeriodSlice {
  revenue: number;
  ledgerFromBookings?: number;
  ledgerFromProductOrders?: number;
  bookings: number;
  completed: number;
  clients: number;
  averageLedgerPerScheduledBooking: number;
  averageValue?: number;
}

interface BusinessComparisonData {
  timezone?: string;
  period: string;
  reportBasis?: string;
  basis?: Record<string, string>;
  windows?: {
    current?: { fromYmd?: string; toYmd?: string; description?: string };
    previous?: { fromYmd?: string; toYmd?: string; description?: string };
  };
  current: PeriodSlice;
  previous: PeriodSlice;
  growth: {
    revenue: number;
    bookings: number;
    clients: number;
    averageLedgerPerScheduledBooking: number;
  };
}

const PERIOD_OPTIONS = [
  { value: "month", label: "Month vs prior month" },
  { value: "quarter", label: "Quarter vs prior quarter" },
  { value: "year", label: "Year vs prior year" },
];

const BASIS_LABELS: Record<string, string> = {
  currentWindow: "Current column",
  previousWindow: "Previous column",
  ledgerHeadline: "Ledger headline",
  averagePerBooking: "Avg per booking",
  bookings: "Booking counts",
  growth: "Growth %",
};

function GrowthRow({
  value,
  suffix = "%",
  isNew = false,
}: {
  value: number;
  suffix?: string;
  isNew?: boolean;
}) {
  if (isNew) {
    return (
      <div className="flex items-center gap-2 border-t pt-3">
        <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600" />
        <p className="text-lg font-semibold text-emerald-700">New</p>
        <span className="text-xs text-gray-500">vs previous column</span>
      </div>
    );
  }
  if (value === 0) {
    return (
      <div className="flex items-center gap-2 border-t pt-3">
        <span className="h-5 w-5 shrink-0 text-center text-gray-500">—</span>
        <p className="text-lg font-semibold tabular-nums text-gray-600">0{suffix}</p>
        <span className="text-xs text-gray-500">vs previous column</span>
      </div>
    );
  }
  const up = value > 0;
  return (
    <div className="flex items-center gap-2 border-t pt-3">
      {up ? <TrendingUp className="h-5 w-5 shrink-0 text-green-600" /> : <TrendingDown className="h-5 w-5 shrink-0 text-red-600" />}
      <p className={`text-lg font-semibold tabular-nums ${up ? "text-green-700" : "text-red-600"}`}>
        {up ? "+" : ""}
        {value.toFixed(1)}
        {suffix}
      </p>
      <span className="text-xs text-gray-500">vs previous column</span>
    </div>
  );
}

function LedgerSplitHint({
  lb,
  lo,
  fmt,
}: {
  lb: number;
  lo: number;
  fmt: (n: number) => string;
}) {
  if ((lb ?? 0) <= 0 || (lo ?? 0) <= 0) return null;
  return (
    <p className="mt-2 text-xs leading-snug text-emerald-900/85">
      Bookings ledger {fmt(lb)} · Product orders {fmt(lo)}
    </p>
  );
}

export default function BusinessComparisonReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<BusinessComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const response = await fetcher.get<{ data: BusinessComparisonData }>(
        `/api/provider/reports/business/comparison?${params.toString()}`,
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading business comparison:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "business-comparison", exportCurrency);
    exportToCSV(exportData, "business-comparison-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Period Comparison" },
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
          { label: "Period Comparison" },
        ]}
      >
        <EmptyReportState title="Failed to load report" description={error || "Unable to load comparison data"} />
      </SettingsDetailLayout>
    );
  }

  const basisText = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  const wc = data.windows?.current;
  const wp = data.windows?.previous;

  const curAvg =
    data.current.averageLedgerPerScheduledBooking ?? data.current.averageValue ?? 0;
  const prevAvg =
    data.previous.averageLedgerPerScheduledBooking ?? data.previous.averageValue ?? 0;
  const avgGrowth =
    data.growth.averageLedgerPerScheduledBooking ??
    (prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : 0);

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Period Comparison" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Period comparison"
          subtitle="Ledger headline vs scheduled bookings — asymmetric windows by design"
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[260px]">
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
          {data.timezone ? <p className="text-sm text-gray-600">Timezone · {data.timezone}</p> : null}
        </div>

        {wc?.fromYmd && wc?.toYmd ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50/90 px-4 py-3 text-sm">
            <p>
              <span className="font-medium text-gray-800">Current:</span> {wc.fromYmd} → {wc.toYmd}
              {wc.description ? <span className="text-gray-600"> · {wc.description}</span> : null}
            </p>
            {wp?.fromYmd && wp?.toYmd ? (
              <p className="mt-1">
                <span className="font-medium text-gray-800">Previous:</span> {wp.fromYmd} → {wp.toYmd}
                {wp.description ? <span className="text-gray-600"> · {wp.description}</span> : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {basisText ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/95 px-4 py-3 text-sm text-sky-950">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">What this report compares</p>
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-emerald-100 bg-emerald-50/35">
            <CardHeader>
              <CardTitle className="text-lg">Ledger earnings</CardTitle>
              <p className="text-sm font-normal text-emerald-900/85">provider_earnings · settlement window per column</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-emerald-900/90">Current</p>
                <p className="text-2xl font-semibold tabular-nums text-emerald-950">{fmt(data.current.revenue)}</p>
                <LedgerSplitHint
                  lb={data.current.ledgerFromBookings ?? 0}
                  lo={data.current.ledgerFromProductOrders ?? 0}
                  fmt={fmt}
                />
              </div>
              <div>
                <p className="mb-1 text-sm text-emerald-900/90">Previous</p>
                <p className="text-xl font-medium tabular-nums text-emerald-900">{fmt(data.previous.revenue)}</p>
                <LedgerSplitHint
                  lb={data.previous.ledgerFromBookings ?? 0}
                  lo={data.previous.ledgerFromProductOrders ?? 0}
                  fmt={fmt}
                />
              </div>
              <GrowthRow value={data.growth.revenue} />
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Scheduled bookings</CardTitle>
              <p className="text-sm font-normal text-gray-500">Excludes cancelled and no-show</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-gray-600">Current</p>
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.current.bookings}</p>
                <p className="mt-1 text-xs text-gray-500">{data.current.completed} completed</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-gray-600">Previous</p>
                <p className="text-xl font-medium tabular-nums text-gray-700">{data.previous.bookings}</p>
                <p className="mt-1 text-xs text-gray-500">{data.previous.completed} completed</p>
              </div>
              <GrowthRow value={data.growth.bookings} />
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Distinct clients</CardTitle>
              <p className="text-sm font-normal text-gray-500">Unique customer_id on bookings above</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-gray-600">Current</p>
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.current.clients}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-gray-600">Previous</p>
                <p className="text-xl font-medium tabular-nums text-gray-700">{data.previous.clients}</p>
              </div>
              <GrowthRow value={data.growth.clients} />
            </CardContent>
          </Card>

          <Card className="border-indigo-100 bg-indigo-50/40">
            <CardHeader>
              <CardTitle className="text-lg">Avg ledger / scheduled booking</CardTitle>
              <p className="text-sm font-normal text-indigo-900/85">
                Booking-linked ledger only ÷ appointment count (not booking.total_amount)
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-indigo-900/90">Current</p>
                <p className="text-2xl font-semibold tabular-nums text-indigo-950">{fmt(curAvg)}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-indigo-900/90">Previous</p>
                <p className="text-xl font-medium tabular-nums text-indigo-900">{fmt(prevAvg)}</p>
              </div>
              <GrowthRow value={avgGrowth} />
            </CardContent>
          </Card>
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
