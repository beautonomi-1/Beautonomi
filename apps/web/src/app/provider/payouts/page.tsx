"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { DollarSign, Calendar, Wallet, FileText, ChevronRight } from "lucide-react";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

interface NextDateData {
  payout_schedule: string;
  minimum_payout_amount: number;
  payout_hold_days: number;
  next_payout_date: string | null;
  next_payout_description: string;
}

interface FinanceEarnings {
  available_balance: number;
  pending_payouts: number;
  minimum_payout_amount: number;
}

interface PayoutItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  requested_at?: string;
  processed_at?: string;
}

export default function ProviderPayoutsCenter() {
  const [nextDate, setNextDate] = useState<NextDateData | null>(null);
  const [earnings, setEarnings] = useState<FinanceEarnings | null>(null);
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { format: fmt } = useReportCurrency();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const [nextRes, financeRes, payoutsRes] = await Promise.allSettled([
          fetcher.get<{ data: NextDateData }>("/api/provider/payouts/next-date"),
          fetcher.get<{ data: { earnings: FinanceEarnings } }>("/api/provider/finance?range=month"),
          fetcher.get<{ data: PayoutItem[] }>("/api/provider/payouts"),
        ]);
        if (nextRes.status === "fulfilled") setNextDate(nextRes.value.data ?? null);
        if (financeRes.status === "fulfilled") setEarnings((financeRes.value.data as any)?.earnings ?? null);
        if (payoutsRes.status === "fulfilled") setPayouts(Array.isArray(payoutsRes.value.data) ? payoutsRes.value.data : []);
        if (nextRes.status === "rejected" && financeRes.status === "rejected") {
          setLoadError("Failed to load payout data. Please refresh.");
        }
      } catch {
        setLoadError("Failed to load payout data. Please refresh.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: "bg-green-100 text-green-800",
      pending: "bg-yellow-100 text-yellow-800",
      processing: "bg-blue-100 text-blue-800",
      failed: "bg-red-100 text-red-800",
    };
    return <Badge className={map[status] ?? "bg-gray-100 text-gray-800"}>{status}</Badge>;
  };

  if (loading && !earnings) {
    return (
      <RoleGuard allowedRoles={["provider_owner", "provider_staff", "superadmin"]}>
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading payout center..." />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff", "superadmin"]}>
      <div className="w-full max-w-full space-y-4 sm:space-y-6">
        <PageHeader
          title="Payout center"
          subtitle="Balance, schedule, and payout history in one place"
          breadcrumbs={[{ label: "Provider", href: "/provider" }, { label: "Payout center", href: "/provider/payouts" }]}
        />

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          <SectionCard title="Available balance" className="md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-100 p-3">
                  <DollarSign className="h-6 w-6 text-emerald-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {fmt(earnings?.available_balance ?? 0)}
                  </p>
                  <p className="text-sm text-gray-500">
                    Min payout: {fmt(earnings?.minimum_payout_amount ?? 100)}
                    {(earnings?.pending_payouts ?? 0) > 0 && (
                      <span> · In queue (pending/processing): {fmt(earnings?.pending_payouts ?? 0)}</span>
                    )}
                  </p>
                </div>
              </div>
              <Link href="/provider/finance">
                <Button>
                  <Wallet className="mr-2 h-4 w-4" />
                  Request payout / Finance
                </Button>
              </Link>
            </div>
          </SectionCard>

          <SectionCard title="Payout schedule">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium capitalize">{nextDate?.payout_schedule ?? "Weekly"}</p>
                {nextDate?.next_payout_date && (
                  <p className="text-sm text-gray-600 mt-1">
                    Next run: {new Date(nextDate.next_payout_date).toLocaleDateString()}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-2">{nextDate?.next_payout_description}</p>
                {nextDate?.payout_hold_days > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    Earnings are available {nextDate.payout_hold_days} day(s) after booking.
                  </p>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Quick links">
            <ul className="space-y-2">
              <li>
                <Link
                  href="/provider/finance"
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50"
                >
                  <span className="font-medium">Finance & request payout</span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </Link>
              </li>
              <li>
                <Link
                  href="/provider/payouts/statements"
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50"
                >
                  <span className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Payout statements
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </Link>
              </li>
              <li>
                <Link
                  href="/provider/settings/payout-accounts"
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-gray-50"
                >
                  <span className="font-medium">Payout accounts</span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </Link>
              </li>
            </ul>
          </SectionCard>
        </div>

        <SectionCard title="Recent payouts">
          {payouts.length === 0 ? (
            <p className="text-sm text-gray-500">No payouts yet. Request a payout from Finance when you have available balance.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Amount</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.slice(0, 10).map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        {p.processed_at
                          ? new Date(p.processed_at).toLocaleDateString()
                          : p.requested_at
                          ? new Date(p.requested_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-3 pr-4 font-medium">{fmt(p.amount)}</td>
                      <td className="py-3">{statusBadge(p.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {payouts.length > 0 && (
            <Link href="/provider/finance" className="inline-block mt-3 text-sm text-primary-600 hover:underline">
              View all on Finance →
            </Link>
          )}
        </SectionCard>
      </div>
    </RoleGuard>
  );
}
