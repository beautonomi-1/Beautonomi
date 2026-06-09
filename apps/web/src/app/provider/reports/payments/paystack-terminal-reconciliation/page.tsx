"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetcher } from "@/lib/http/fetcher";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
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

export default function PaystackTerminalReconciliationPage() {
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const { format: fmt } = useReportCurrency();
  const [rows, setRows] = useState<PaystackTerminalReportRow[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetcher.get<{
        data: { rows: PaystackTerminalReportRow[]; totals: Record<string, number> };
      }>("/api/provider/reports/payments/paystack-terminal-reconciliation");
      setRows(response.data?.rows ?? []);
      setTotals(response.data?.totals ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!paystackTerminalEnabled) return;
    void load();
  }, [paystackTerminalEnabled]);

  if (!paystackTerminalEnabled) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="rounded-lg border bg-gray-50 p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Paystack Terminal unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">
            Paystack Terminal is not enabled for your account, so this report is unavailable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Paystack Terminal reconciliation</h1>
          <p className="text-gray-600">
            Received terminal payments, provider allocations, holds, payout readiness, refunds, and disputes.
          </p>
        </div>
        <Button onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">{error}</div> : null}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {["received", "allocated", "unallocated", "held", "eligible", "declined"].map((key) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">{formatStatusLabel(key)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{fmt(Number(totals[key] ?? 0))}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">No Paystack Terminal payments found.</p>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">
                      {fmt(Number(row.paid_amount ?? 0))}
                    </p>
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
    </div>
  );
}
