"use client";
import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";
import Link from "next/link";
import { fetcher, DEFAULT_FETCH_TIMEOUT_MS } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";

interface StatementData {
  period: { from: string; to: string };
  total_earnings: number;
  total_payouts: number;
  total_platform_fees: number;
  payouts: Array<{
    id: string;
    payout_number: string;
    amount: number;
    net_amount: number;
    currency: string;
    status: string;
    requested_at: string;
    processed_at: string | null;
  }>;
  currency: string;
}

function downloadCSV(data: StatementData, t: (key: string) => string) {
  const quote = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    [t("web.provider.pages.payouts/statements.csvTitle"), `${data.period.from} to ${data.period.to}`],
    [],
    [t("web.provider.pages.payouts/statements.csvSummary"), ""],
    [t("web.provider.pages.payouts/statements.csvTotalEarnings"), `${data.currency} ${data.total_earnings.toLocaleString()}`],
    [t("web.provider.pages.payouts/statements.csvTotalPayouts"), `${data.currency} ${data.total_payouts.toLocaleString()}`],
    [t("web.provider.pages.payouts/statements.csvPlatformFees"), `${data.currency} ${data.total_platform_fees.toLocaleString()}`],
    [],
    [t("web.provider.pages.payouts/statements.csvPayouts"), ""],
    [t("web.provider.pages.payouts/statements.csvPayoutNumber"), t("web.provider.common.amount"), t("web.provider.pages.payouts/statements.csvNet"), t("web.provider.common.statusLabel"), t("web.provider.pages.payouts/statements.csvRequested"), t("web.provider.pages.payouts/statements.csvProcessed")],
    ...data.payouts.map((p) => [
      p.payout_number,
      p.amount,
      p.net_amount,
      p.status,
      p.requested_at ? format(new Date(p.requested_at), "yyyy-MM-dd") : "",
      p.processed_at ? format(new Date(p.processed_at), "yyyy-MM-dd") : "",
    ]),
  ];
  const csv = rows.map((r) => r.map(quote).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payout-statement-${data.period.from}-${data.period.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProviderPayoutStatements() {
  const { t } = useTranslation();
  const now = new Date();
  const [from, setFrom] = useState(format(subDays(now, 90), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(now, "yyyy-MM-dd"));
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetcher.get<{ data: StatementData }>(
        `/api/provider/payouts/statements?from=${from}&to=${to}`,
        { timeoutMs: Math.max(DEFAULT_FETCH_TIMEOUT_MS, 90_000) },
      );
      setData(res.data ?? null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : t("web.provider.pages.payouts/statements.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [from, to]);

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff", "superadmin"]}>
      <div className="w-full max-w-full space-y-4 sm:space-y-6">
        <PageHeader
          title={t("web.provider.finance.payoutStatements")}
          subtitle={t("web.provider.pages.payouts/statements.subtitle")}
          breadcrumbs={[
            { label: t("web.provider.topbar.mobileTitles.more"), href: "/provider/more" },
            { label: t("web.provider.sidebar.sections.finance"), href: "/provider/finance?tab=payouts" },
            { label: t("web.provider.finance.statements") },
          ]}
        />

        <SectionCard title={t("web.provider.pages.payouts/statements.dateRange")}>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label className="text-sm">{t("web.provider.reports.common.from")}</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-40"
              />
            </div>
            <div>
              <Label className="text-sm">{t("web.provider.reports.common.to")}</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-40"
              />
            </div>
          </div>
        </SectionCard>

        {loading ? (
          <SectionCard>
            <p className="text-sm text-gray-500">{t("web.provider.settings.common.loading")}</p>
          </SectionCard>
        ) : data ? (
          <>
            <SectionCard title={t("web.provider.pages.payouts/statements.csvSummary")}>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-gray-500">{t("web.provider.pages.payouts/statements.csvTotalEarnings")}</p>
                  <p className="text-xl font-semibold">{data.currency} {data.total_earnings.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t("web.provider.pages.payouts/statements.totalPayouts")}</p>
                  <p className="text-xl font-semibold">{data.currency} {data.total_payouts.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t("web.provider.pages.payouts/statements.platformFees")}</p>
                  <p className="text-xl font-semibold">{data.currency} {data.total_platform_fees.toLocaleString()}</p>
                </div>
              </div>
              <Button onClick={() => downloadCSV(data, t)} className="mt-4" variant="outline">
                <Download className="me-2 h-4 w-4" />
                {t("web.provider.pages.payouts/statements.downloadCsv")}
              </Button>
            </SectionCard>

            <SectionCard title={t("web.provider.pages.payouts/statements.payoutsInPeriod")}>
              {data.payouts.length === 0 ? (
                <p className="text-sm text-gray-500">{t("web.provider.pages.payouts/statements.emptyPayouts")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-start text-gray-500">
                        <th className="pb-2 pe-4">{t("web.provider.pages.payouts/statements.payoutNumber")}</th>
                        <th className="pb-2 pe-4">{t("web.provider.common.amount")}</th>
                        <th className="pb-2 pe-4">{t("web.provider.common.statusLabel")}</th>
                        <th className="pb-2 pe-4">{t("web.provider.pages.payouts/statements.requested")}</th>
                        <th className="pb-2">{t("web.provider.pages.payouts/statements.processed")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payouts.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-3 pe-4">{p.payout_number || p.id.slice(0, 8)}</td>
                          <td className="py-3 pe-4 font-medium">{data.currency} {p.amount.toLocaleString()}</td>
                          <td className="py-3 pe-4">{p.status}</td>
                          <td className="py-3 pe-4">{p.requested_at ? format(new Date(p.requested_at), "yyyy-MM-dd") : t("web.provider.common.emDash")}</td>
                          <td className="py-3">{p.processed_at ? format(new Date(p.processed_at), "yyyy-MM-dd") : t("web.provider.common.emDash")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        ) : error ? (
          <SectionCard title={t("web.provider.pages.payouts/statements.loadFailed")}>
            <p className="text-sm text-red-600">{error}</p>
            <Button onClick={() => void load()} className="mt-4" variant="outline">
              {t("web.provider.pages.payouts/statements.tryAgain")}
            </Button>
          </SectionCard>
        ) : (
          <SectionCard>
            <p className="text-sm text-gray-500">{t("web.provider.pages.payouts/statements.tryAnotherRange")}</p>
            <Button onClick={() => void load()} className="mt-4" variant="outline">
              {t("web.provider.pages.payouts/statements.tryAgain")}
            </Button>
          </SectionCard>
        )}

        <p className="text-sm text-gray-500">
          <Link href="/provider/finance?tab=payouts" className="text-primary-600 hover:underline">
            {t("web.provider.pages.payouts/statements.backToFinance")}
          </Link>
        </p>
      </div>
    </RoleGuard>
  );
}
