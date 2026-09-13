"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { getDefaultMoneyLocale } from "@beautonomi/utils";
import BackButton from "../../components/back-button";
import { useTranslation } from "@beautonomi/i18n";
import type { TFunction } from "@beautonomi/i18n";

type BillingItem = {
  id: string;
  date: string;
  amount: number;
  fees: number;
  net: number;
  status: string;
  kind?: string;
  is_renewal: boolean;
  plan_name: string;
  provider_name: string;
  provider_id: string | null;
  reference: string | null;
  receipt_url: string | null;
  failure_reason?: string | null;
};

function formatDateSafe(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatMoney(amount: number, currency = "ZAR"): string {
  return new Intl.NumberFormat(getDefaultMoneyLocale(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function statusBadge(status: string, t: TFunction) {
  const s = status.toLowerCase();
  if (s === "paid") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        {t("web.accountSettings.membership.billingHistoryPage.paid")}
      </Badge>
    );
  }
  if (s === "failed") {
    return <Badge variant="destructive">{t("web.accountSettings.membership.billingHistoryPage.failed")}</Badge>;
  }
  if (s === "pending") {
    return (
      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
        {t("web.accountSettings.membership.billingHistoryPage.pending")}
      </Badge>
    );
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export default function MembershipBillingHistoryPageClient() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const providerId = searchParams.get("provider_id") ?? undefined;
  const planId = searchParams.get("plan_id") ?? undefined;
  const providerName = searchParams.get("provider_name") ?? undefined;

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (providerId) q.set("provider_id", providerId);
    if (planId) q.set("plan_id", planId);
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [providerId, planId]);

  const [items, setItems] = useState<BillingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher.get<{ data: { items?: BillingItem[] } }>(
        `/api/me/membership/billing-history${query}`,
        { cache: "no-store", staleTimeMs: 0 }
      );
      setItems(res.data?.items ?? []);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : t("web.accountSettings.membership.billingHistoryPage.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = providerName
    ? t("web.accountSettings.membership.billingHistoryPage.titleNamed", { name: providerName })
    : t("web.accountSettings.membership.billingHistoryPage.title");

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage={t("web.accountSettings.membership.billingHistoryPage.loading")} />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <BackButton href="/account-settings/membership" label={t("web.accountSettings.membership.billingHistoryPage.backToMemberships")} />
      <h1 className="mb-6 text-2xl font-bold">{title}</h1>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
          {error}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
            {t("web.accountSettings.bookings.list.retry")}
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-600">
            {t("web.accountSettings.membership.billingHistoryPage.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">
                    {item.plan_name}{" "}
                    {item.is_renewal
                      ? t("web.accountSettings.membership.billingHistoryPage.renewal")
                      : t("web.accountSettings.membership.billingHistoryPage.initial")}
                  </p>
                  <p className="text-sm text-gray-600">{item.provider_name}</p>
                  <p className="text-sm text-gray-500">{formatDateSafe(item.date)}</p>
                  {item.failure_reason ? (
                    <p className="mt-1 text-sm text-red-700">{item.failure_reason}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <p className="text-lg font-bold text-gray-900">{formatMoney(item.amount)}</p>
                  {statusBadge(item.status, t)}
                  {item.receipt_url && item.status === "paid" ? (
                    <Button variant="link" className="h-auto p-0" asChild>
                      <a href={item.receipt_url} target="_blank" rel="noopener noreferrer">
                        <FileText className="me-1 inline h-4 w-4" />
                        {t("web.accountSettings.membership.billingHistoryPage.downloadReceipt")}
                      </a>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6">
        <Button variant="outline" asChild>
          <Link href="/account-settings/membership">
            {t("web.accountSettings.membership.billingHistoryPage.backToMemberships")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
