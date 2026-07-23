"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, CreditCard, ShoppingBag, Calendar, Download, HeartHandshake, Ban, Info } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { format } from "date-fns";
import { ReportSkeleton } from "../components/ReportSkeleton";
import { EmptyReportState } from "../components/EmptyReportState";
import type { EndOfDayResponse } from "@/app/api/provider/reports/end-of-day/route";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../utils/export";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RECORDED_TAKINGS_PAYMENT_METHODS } from "@/lib/reports/recorded-takings";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  paystack: "Paystack",
  paystack_terminal: "Paystack Terminal",
  yoco: "Yoco",
  paycloud: "Card machine",
  gift_card: "Gift card",
  wallet: "Wallet",
  other: "Other",
};

export default function EndOfDayReportPage() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [data, setData] = useState<EndOfDayResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [date, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({ date });
      appendLocation(params);
      const response = await fetcher.get<{ data: EndOfDayResponse }>(
        `/api/provider/reports/end-of-day?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = (fmt: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (fmt === "csv") {
      const rows = formatReportDataForExport(data as unknown as ReportRow, "end-of-day", exportCurrency);
      exportToCSV(rows, "end-of-day-report");
    } else {
      exportToPDF("end-of-day-report", "end-of-day-report", "End of day report");
    }
  };

  if (isLoading && !data) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "End of day" },
        ]}
      >
        <ReportSkeleton />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "End of day" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="End of day"
          subtitle="Till-style totals by capture timestamps — not the same as ledger payouts"
        />

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="eod-date" className="text-sm font-medium text-gray-700">Date</Label>
            <Input
              id="eod-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[180px] rounded-xl border border-gray-200 bg-white shadow-sm"
            />
          </div>
          <Button onClick={loadReport} disabled={isLoading} className="rounded-xl">
            {isLoading ? "Loading…" : "Update"}
          </Button>
          {data && !error && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleExport("csv")}>
                <Download className="h-4 w-4 mr-1" />
                CSV
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleExport("pdf")}>
                Print / PDF
              </Button>
            </div>
          )}
        </div>

        {error && (
          <EmptyReportState
            title="Failed to load report"
            description={error}
          />
        )}

        {data && !error && (
          <div id="end-of-day-report" className="space-y-6">
            <Alert className="border-sky-200 bg-sky-50 text-sky-950">
              <Info className="h-4 w-4 text-sky-800" />
              <div>
                <AlertTitle className="text-sky-950">What this report counts</AlertTitle>
                <AlertDescription className="text-sky-950/90 space-y-2 text-sm leading-relaxed">
                  <p>{data.reportBasis}</p>
                  {data.timezone ? (
                    <p className="text-xs text-sky-900/85">Calendar day for “{data.date}” is interpreted in {data.timezone}.</p>
                  ) : null}
                </AlertDescription>
              </div>
            </Alert>

            <Card className="rounded-2xl border-indigo-200 bg-gradient-to-br from-indigo-50 to-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                  <Banknote className="w-5 h-5" />
                  Total recorded takings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-semibold tracking-tight text-indigo-950 tabular-nums">
                  {fmt(data.total)}
                </p>
                <p className="mt-2 text-sm text-indigo-900/85">
                  Booking payments + wallet (split-safe) + retail / legacy sales + tips + cancellation fees
                  retained (see breakdown below).
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-emerald-600" />
                    Booking payments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.bookingPaymentsTotal)}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Completed <code className="text-[11px]">booking_payments</code> rows captured on this day
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-violet-600" />
                    Wallet (extra)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.walletTotal)}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Wallet share not already covered by booking payment rows (avoids double-counting splits).
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-amber-600" />
                    Retail / legacy sales
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.salesTotal)}</p>
                  <p className="text-xs text-gray-500 mt-2">{data.salesCount} line(s) — walk-in orders + legacy sales</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <HeartHandshake className="w-4 h-4 text-rose-500" />
                    Tips (ledger)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.tipsTotal)}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    <code className="text-[11px]">finance_transactions</code> tip rows settled this day
                  </p>
                  {Number(data.cashbackTotal ?? 0) > 0 ? (
                    <p className="text-xs text-gray-500 mt-2">
                      Cashback (till cash-out): {fmt(data.cashbackTotal)} — not included in recorded total
                    </p>
                  ) : null}
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <Ban className="w-4 h-4 text-orange-600" />
                    Cancellation fees
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.cancellationFeesTotal)}</p>
                  <p className="text-xs text-gray-500 mt-2">Ledger cancellation_fee rows settled this day</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-600" />
                    Distinct bookings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-gray-900">{data.bookingCount}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Unique bookings with takings from payments and/or wallet bucket
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-xl border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="w-5 h-5" />
                  By payment method — {data.date}
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Rolled up mix (same underlying numbers as the breakdown above).
                </p>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Method</th>
                      <th className="text-right py-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const keys = RECORDED_TAKINGS_PAYMENT_METHODS.filter(
                        (key) => Number(data.byPaymentMethod?.[key] ?? 0) >= 0.005,
                      );
                      if (keys.length === 0) {
                        return (
                          <tr>
                            <td colSpan={2} className="py-8 text-center text-sm text-gray-500">
                              No takings by method for this day.
                            </td>
                          </tr>
                        );
                      }
                      return keys.map((key) => {
                        const label = PAYMENT_LABELS[key] ?? key;
                        const amount = Number(data.byPaymentMethod?.[key] ?? 0);
                        return (
                          <tr key={key} className="border-b border-gray-100">
                            <td className="py-2.5">{label}</td>
                            <td className="text-right py-2.5 font-mono tabular-nums font-medium">
                              {fmt(amount)}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {data.note ? (
              <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-4">{data.note}</p>
            ) : null}
          </div>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
