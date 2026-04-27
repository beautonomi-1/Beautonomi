"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, CreditCard, ShoppingBag, Calendar, Download } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { format } from "date-fns";
import { ReportSkeleton } from "../components/ReportSkeleton";
import { EmptyReportState } from "../components/EmptyReportState";
import type { EndOfDayResponse } from "@/app/api/provider/reports/end-of-day/route";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../utils/export";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  paystack: "Paystack",
  yoco: "Yoco",
  gift_card: "Gift card",
  other: "Other",
};

export default function EndOfDayReportPage() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency } = useReportCurrency();
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
          subtitle="Daily takings by payment method for cash-up"
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
          <div id="end-of-day-report">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4" />
                    Bookings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.bookingCount} payments</p>
                  <p className="text-lg text-gray-600">
                    {typeof data.bookingPaymentsTotal === "number"
                      ? data.bookingPaymentsTotal.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "0.00"}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Sales
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.salesCount} sales</p>
                  <p className="text-lg text-gray-600">
                    {typeof data.salesTotal === "number"
                      ? data.salesTotal.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "0.00"}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <Banknote className="w-4 h-4" />
                    Total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-gray-900">
                    {typeof data.total === "number"
                      ? data.total.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "0.00"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-xl border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="w-5 h-5" />
                  By payment method — {data.date}
                </CardTitle>
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
                    {PAYMENT_LABELS &&
                      Object.entries(PAYMENT_LABELS).map(([key, label]) => {
                        const amount = data.byPaymentMethod?.[key] ?? 0;
                        return (
                          <tr key={key} className="border-b border-gray-100">
                            <td className="py-2">{label}</td>
                            <td className="text-right py-2 font-mono">
                              {Number(amount).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
