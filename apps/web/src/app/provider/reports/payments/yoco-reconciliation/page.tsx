"use client";
import { useReportExportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, CreditCard, CheckCircle, XCircle, AlertCircle, Download } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";
import type { YocoReconciliationResponse } from "@/app/api/provider/reports/payments/yoco-reconciliation/route";

export default function YocoReconciliationReport() {
  const exportCurrency = useReportExportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<YocoReconciliationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps -- load when dateRange changes

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
          subtitle="Compare Yoco payments with booking payments to spot missed webhooks or duplicates"
        />

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        <div className="flex justify-end">
          <Button variant="outline" onClick={handleExport} disabled={!data || data.payments.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Yoco payments</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With booking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.with_booking}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Synced to booking</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.synced}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Not synced</CardTitle>
              <XCircle className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.not_synced}</div>
            </CardContent>
          </Card>
        </div>

        {summary.not_synced > 0 && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  {summary.not_synced} Yoco payment(s) linked to a booking do not have a matching booking payment.
                  This can happen if the webhook was missed or delayed. Check the list below and your Yoco dashboard
                  if needed.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent Yoco payments</CardTitle>
            <p className="text-sm text-muted-foreground">
              Booking-linked rows show whether they were synced to booking_payments (via webhook).
            </p>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No Yoco payments in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Date</th>
                      <th className="text-left py-2 font-medium">Yoco ID</th>
                      <th className="text-right py-2 font-medium">Amount</th>
                      <th className="text-left py-2 font-medium">Status</th>
                      <th className="text-left py-2 font-medium">Booking</th>
                      <th className="text-left py-2 font-medium">Synced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2">{format(new Date(p.created_at), "MMM d, yyyy HH:mm")}</td>
                        <td className="py-2 font-mono text-xs">{p.yoco_payment_id}</td>
                        <td className="py-2 text-right">
                          {(p.amount / 100).toFixed(2)} {p.currency}
                        </td>
                        <td className="py-2">{p.status}</td>
                        <td className="py-2">
                          {p.appointment_id ? (
                            <span className="text-muted-foreground">Yes</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2">
                          {p.appointment_id ? (
                            p.booking_synced ? (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-4 w-4" /> Synced
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-600">
                                <XCircle className="h-4 w-4" /> Not synced
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
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
          <Button variant="outline" onClick={loadReport} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
