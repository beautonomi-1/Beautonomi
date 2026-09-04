"use client";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Gift, DollarSign, TrendingUp } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface GiftCardRedemptionsData {
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  reportBasis?: string;
  basis?: Record<string, string>;
  totalRedemptions: number;
  totalRedeemedValue: number;
  averageRedemptionValue: number;
  redemptionRateNote?: string;
  redemptions: Array<{
    id: string;
    amount: number;
    captured_at?: string;
    redeemed_at?: string;
  }>;
}

const BASIS_LABELS: Record<string, string> = {
  bookingWindow: "Bookings",
  redemptionWindow: "Redemptions",
  listLimit: "List",
  redemptionRate: "Rate",
};

export default function GiftCardRedemptionsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<GiftCardRedemptionsData | null>(null);
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

      const response = await fetcher.get<{ data: GiftCardRedemptionsData }>(
        `/api/provider/reports/gift-cards/redemptions?${params.toString()}`,
        { timeoutMs: 120_000 },
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading gift card redemptions:", err);
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
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "gift-card-redemptions", exportCurrency);
    exportToCSV(exportData, "gift-card-redemptions-detail-report");
  };

  const captureTime = (r: GiftCardRedemptionsData["redemptions"][0]) =>
    r.redeemed_at ?? r.captured_at ?? "";

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Gift cards · Activity" },
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
          { label: "Gift cards · Activity" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load gift card redemptions"}
        />
      </SettingsDetailLayout>
    );
  }

  const basisEntries = data.basis
    ? (Object.entries(data.basis) as [string, string][]).filter(([, v]) => v?.trim())
    : [];

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Gift cards · Activity" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Gift cards · Recent captures"
          subtitle="Up to 20 captured redemptions with the same rules as the summary report (booking scheduled date + capture time both in range)."
          actions={
            <Button variant="outline" onClick={handleExport} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
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
              {data.timezone ? <span>Timezone · {data.timezone}</span> : null}
              {data.fromYmd && data.toYmd ? (
                <span>
                  Window · {data.fromYmd} – {data.toYmd}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {basisEntries.length > 0 ? (
          <Card className="border-violet-100 bg-violet-50/40 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-violet-950">Definitions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-violet-950/95">
              {basisEntries.map(([k, v]) => (
                <p key={k}>
                  <span className="font-medium">{BASIS_LABELS[k] ?? k} · </span>
                  {v}
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Redemption rows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalRedemptions}</p>
                <Gift className="h-5 w-5 shrink-0 text-pink-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Redeemed value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalRedeemedValue)}</p>
                <DollarSign className="h-5 w-5 shrink-0 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg per row</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.averageRedemptionValue)}</p>
                <TrendingUp className="h-5 w-5 shrink-0 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {data.redemptionRateNote ? (
          <p className="text-sm text-gray-600 leading-relaxed">{data.redemptionRateNote}</p>
        ) : null}

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Recent captures</CardTitle>
            <p className="text-sm font-normal text-gray-500 mt-1">
              Timestamps are gift_card_redemptions.captured_at (payment capture time).
            </p>
          </CardHeader>
          <CardContent>
            {data.redemptions.length === 0 ? (
              <EmptyReportState title="No redemptions" description="No qualifying rows in the selected period." />
            ) : (
              <div className="space-y-2">
                {data.redemptions.map((redemption) => {
                  const t = captureTime(redemption);
                  const safe = t ? format(new Date(t), "MMM dd, yyyy 'at' h:mm a") : "—";
                  return (
                    <div
                      key={redemption.id}
                      className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-100/80"
                    >
                      <p className="text-sm text-gray-900">{safe}</p>
                      <p className="font-semibold tabular-nums text-gray-900">{fmt(Number(redemption.amount || 0))}</p>
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
