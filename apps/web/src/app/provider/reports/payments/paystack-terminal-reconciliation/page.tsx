"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCw } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";
import { formatStatusLabel } from "@/lib/locale/status-label";

type PaystackTerminalReportRow = {
  id: string;
  paystack_reference: string;
  paid_amount: number;
  currency: string;
  allocation_status: string;
  amount_match_status: string;
  payout_eligibility_status: string;
  created_at: string;
  terminal?: { name?: string | null; terminal_code?: string | null };
};

type PaystackReconciliationData = {
  rows: PaystackTerminalReportRow[];
  totals: Record<string, number>;
  count: number;
  fromYmd?: string;
  toYmd?: string;
};

export default function PaystackTerminalReconciliationPage() {
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<PaystackReconciliationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      const response = await fetcher.get<{ data: PaystackReconciliationData }>(
        `/api/provider/reports/payments/paystack-terminal-reconciliation?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!paystackTerminalEnabled) return;
    void loadReport();
  }, [dateRange, paystackTerminalEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = () => {
    setDateRange({ from: subDays(new Date(), 30), to: new Date() });
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(
      data as unknown as ReportRow,
      "paystack-terminal-reconciliation",
      exportCurrency
    );
    exportToCSV(exportData, "paystack-terminal-reconciliation");
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Reports", href: "/provider/reports" },
    { label: "Payments", href: "/provider/reports/payments/summary" },
    { label: "Paystack Terminal reconciliation" },
  ];

  if (!paystackTerminalEnabled) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <EmptyReportState
          title="Paystack Terminal unavailable"
          description="Paystack Terminal is not enabled for your account, so this report is unavailable."
        />
      </SettingsDetailLayout>
    );
  }

  if (isLoading && !data) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <ReportSkeleton />
      </SettingsDetailLayout>
    );
  }

  if (error && !data) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <EmptyReportState
          title="Failed to load report"
          description={error}
          action={{ label: "Try again", onClick: () => void loadReport() }}
        />
      </SettingsDetailLayout>
    );
  }

  const rows = data?.rows ?? [];
  const totals = data?.totals ?? {};

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs}>
      <PageHeader
        title="Paystack Terminal reconciliation"
        subtitle="Received terminal payments, allocations, holds, and payout readiness"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void loadReport()} disabled={isLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={!rows.length}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} onReset={handleReset} />

      <div className="mb-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {["received", "allocated", "unallocated", "held", "eligible", "declined"].map((key) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">{formatStatusLabel(key)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{fmt(Number(totals[key] ?? 0))}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payments ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <EmptyReportState
              title="No Paystack Terminal payments"
              description="No terminal payments were captured in the selected date range."
            />
          ) : (
            rows.map((row) => (
              <div key={row.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium tabular-nums">{fmt(Number(row.paid_amount ?? 0))}</p>
                    <p className="font-mono text-xs text-gray-500">{row.paystack_reference}</p>
                    <p className="text-xs text-gray-500">
                      {row.terminal?.name ?? "Terminal"} · {row.terminal?.terminal_code ?? ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{formatStatusLabel(row.allocation_status)}</Badge>
                    <Badge variant="secondary">{formatStatusLabel(row.amount_match_status)}</Badge>
                    <Badge>{formatStatusLabel(row.payout_eligibility_status)}</Badge>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </SettingsDetailLayout>
  );
}
