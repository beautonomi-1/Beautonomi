"use client";

import React, { useState, useEffect } from "react";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, DollarSign, Calendar, Clock, Info } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { addLocationIdToUrl } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface LedgerSlice {
  revenue: number;
  ledgerFromBookings?: number;
  ledgerFromProductOrders?: number;
}

interface BusinessDashboardData {
  timezone?: string;
  windows?: {
    today?: { fromYmd?: string; toYmd?: string };
    week?: { fromYmd?: string; toYmd?: string };
    month?: { fromYmd?: string; toYmd?: string };
  };
  reportBasis?: string;
  basis?: Record<string, string>;
  today: LedgerSlice & {
    bookings: number;
    completed: number;
  };
  week: LedgerSlice & {
    bookings: number;
  };
  month: LedgerSlice & {
    bookings: number;
    clients: number;
  };
  upcomingBookings: Array<{
    id: string;
    scheduled_at: string;
    status: string;
    total_amount?: number | null;
  }>;
  recentBookings: Array<{
    id: string;
    scheduled_at: string;
    status: string;
    total_amount?: number | null;
  }>;
}

const BASIS_LABELS: Record<string, string> = {
  ledgerHeadline: "Ledger headline",
  bookingCounts: "Booking counts",
  todayWindow: "Today",
  weekWindow: "Week",
  monthWindow: "Month",
  upcomingList: "Upcoming list",
  recentList: "Recent list",
  bookedAmountColumn: "Booked amount column",
};

function LedgerSplitNote({
  lb,
  lo,
  fmt,
}: {
  lb: number;
  lo: number;
  fmt: (n: number) => string;
}) {
  if (lb <= 0 || lo <= 0) return null;
  return (
    <p className="mt-2 text-xs leading-snug text-emerald-900/85">
      Bookings {fmt(lb)} · Product orders {fmt(lo)}
    </p>
  );
}

export default function BusinessDashboardReport() {
  const { selectedLocationId } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [data, setData] = useState<BusinessDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: BusinessDashboardData }>(
        addLocationIdToUrl("/api/provider/reports/business/dashboard", selectedLocationId),
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading business dashboard:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = (formatKind: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (formatKind === "csv") {
      const exportData = formatReportDataForExport(data as unknown as ReportRow, "business-dashboard", exportCurrency);
      exportToCSV(exportData, "business-dashboard-report");
    } else {
      exportToPDF("business-dashboard-report", "business-dashboard-report", "Performance Dashboard");
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Performance Dashboard" },
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
          { label: "Performance Dashboard" },
        ]}
      >
        <EmptyReportState title="Failed to load report" description={error || "Unable to load dashboard data"} />
      </SettingsDetailLayout>
    );
  }

  const basisText = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  const bookedSnapshot = (row: { total_amount?: number | null }) => {
    const n = row.total_amount;
    if (n == null || Number.isNaN(Number(n))) return null;
    return fmt(Number(n));
  };

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Performance Dashboard" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="business-dashboard-report">
        <PageHeader
          title="Performance Dashboard"
          subtitle="Ledger earnings + scheduled booking counts — snapshot panels"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleExport("csv")}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => handleExport("pdf")}>
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            </div>
          }
        />

        {basisText ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/95 px-4 py-3 text-sm text-sky-950">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">What this dashboard counts</p>
                <p className="mt-2 leading-relaxed">{basisText}</p>
                {data.timezone ? (
                  <p className="mt-2 text-xs text-sky-900/85">Timezone · {data.timezone}</p>
                ) : null}
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-emerald-100 bg-emerald-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-emerald-900">Today · ledger earnings</CardTitle>
              <p className="text-xs font-normal text-emerald-800/90">{data.windows?.today?.fromYmd ?? ""} · settlement window</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-emerald-950">{fmt(data.today.revenue)}</p>
                <DollarSign className="h-8 w-8 shrink-0 text-emerald-600 opacity-90" />
              </div>
              <LedgerSplitNote lb={data.today.ledgerFromBookings ?? 0} lo={data.today.ledgerFromProductOrders ?? 0} fmt={fmt} />
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-700">Today · appointments</CardTitle>
              <p className="text-xs font-normal text-gray-500">scheduled today · excludes cancelled and no-show</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.today.bookings}</p>
                  <p className="mt-1 text-xs text-gray-500">{data.today.completed} completed</p>
                </div>
                <Calendar className="h-8 w-8 text-blue-600 opacity-90" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-indigo-100 bg-indigo-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-indigo-900">This week · ledger</CardTitle>
              <p className="text-xs font-normal text-indigo-800/90">
                {data.windows?.week?.fromYmd} → {data.windows?.week?.toYmd} · Mon–Sun
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-indigo-950">{fmt(data.week.revenue)}</p>
                  <p className="mt-1 text-xs text-indigo-900/85">{data.week.bookings} bookings (scheduled)</p>
                </div>
                <Calendar className="h-8 w-8 shrink-0 text-indigo-600 opacity-90" />
              </div>
              <LedgerSplitNote lb={data.week.ledgerFromBookings ?? 0} lo={data.week.ledgerFromProductOrders ?? 0} fmt={fmt} />
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">This calendar month</CardTitle>
            <p className="text-sm font-normal text-gray-500">
              {data.windows?.month?.fromYmd} → {data.windows?.month?.toYmd} · ledger rows settle by capture date (may lag bookings)
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="text-sm text-emerald-900">Ledger earnings</p>
                <p className="text-2xl font-semibold tabular-nums text-emerald-950">{fmt(data.month.revenue)}</p>
                <LedgerSplitNote lb={data.month.ledgerFromBookings ?? 0} lo={data.month.ledgerFromProductOrders ?? 0} fmt={fmt} />
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-sm text-gray-600">Scheduled bookings</p>
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.month.bookings}</p>
                <p className="mt-1 text-xs text-gray-500">Excludes cancelled and no-show</p>
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-sm text-gray-600">Distinct clients</p>
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.month.clients}</p>
                <p className="mt-1 text-xs text-gray-500">Unique customer_id on month bookings above</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Upcoming appointments</CardTitle>
            <p className="text-sm font-normal text-gray-500">Next 10 · booked total is snapshot, not ledger earnings</p>
          </CardHeader>
          <CardContent>
            {data.upcomingBookings.length === 0 ? (
              <EmptyReportState title="No upcoming bookings" description="Nothing scheduled ahead in this scope." />
            ) : (
              <div className="space-y-3">
                {data.upcomingBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 shrink-0 text-blue-600" />
                      <div>
                        <p className="font-medium text-gray-900">
                          {format(new Date(booking.scheduled_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                        <p className="text-sm capitalize text-gray-600">{booking.status.replace(/_/g, " ")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums text-gray-900">{bookedSnapshot(booking) ?? "—"}</p>
                      <p className="text-[10px] text-gray-400">booked total</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Recent appointments</CardTitle>
            <p className="text-sm font-normal text-gray-500">Last 10 past · booked total is snapshot</p>
          </CardHeader>
          <CardContent>
            {data.recentBookings.length === 0 ? (
              <EmptyReportState title="No recent bookings" description="No past appointments in this scope." />
            ) : (
              <div className="space-y-3">
                {data.recentBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 shrink-0 text-gray-600" />
                      <div>
                        <p className="font-medium text-gray-900">
                          {format(new Date(booking.scheduled_at), "MMM dd, yyyy 'at' h:mm a")}
                        </p>
                        <p className="text-sm capitalize text-gray-600">{booking.status.replace(/_/g, " ")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums text-gray-900">{bookedSnapshot(booking) ?? "—"}</p>
                      <p className="text-[10px] text-gray-400">booked total</p>
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
