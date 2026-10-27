"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fetcher, FetchError, providerPortalFetch } from "@/lib/http/fetcher";
import { formatStatusLabel } from "@/lib/locale/status-label";
import { openProviderBillingReceipt } from "@/lib/receipts/open-provider-billing-receipt";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { CreditCard, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type BillingHistoryItem = {
  id: string;
  amount: number;
  currency?: string | null;
  status: string;
  type?: string;
  description?: string | null;
  created_at: string;
  invoice_url?: string | null;
};

type BillingHistoryPayload = {
  items: BillingHistoryItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

const LIMIT = 50;

export function ProviderBillingHistoryPanel() {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const fallbackCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;

  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<BillingHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildQuery = useCallback(
    (pageOffset: number) => {
      const p = new URLSearchParams();
      p.set("limit", String(LIMIT));
      p.set("offset", String(pageOffset));
      if (typeFilter !== "all") p.set("type", typeFilter);
      if (dateFrom) p.set("date_from", dateFrom);
      if (dateTo) p.set("date_to", dateTo);
      return p.toString();
    },
    [typeFilter, dateFrom, dateTo],
  );

  const exportHref = useMemo(() => {
    const p = new URLSearchParams();
    if (typeFilter !== "all") p.set("type", typeFilter);
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    const qs = p.toString();
    return `/api/provider/billing-history/export${qs ? `?${qs}` : ""}`;
  }, [typeFilter, dateFrom, dateTo]);

  const loadPage = useCallback(
    async (pageOffset: number, append: boolean) => {
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        setError(null);
        const res = await fetcher.get<{ data: BillingHistoryPayload }>(
          `/api/provider/billing-history?${buildQuery(pageOffset)}`,
        );
        const payload = res.data;
        setTotal(payload.total ?? 0);
        setHasMore(Boolean(payload.has_more));
        setItems((prev) =>
          append ? [...prev, ...(payload.items ?? [])] : (payload.items ?? []),
        );
      } catch (err) {
        const msg =
          err instanceof FetchError
            ? err.message
            : t("web.provider.settings.pages.billing.failedToLoadBillingInformationFallback");
        setError(msg);
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildQuery, t],
  );

  useEffect(() => {
    setOffset(0);
    void loadPage(0, false);
  }, [typeFilter, dateFrom, dateTo, loadPage]);

  const formatCurrency = (amount: number, currency?: string | null) =>
    formatMoney(Number(amount || 0), currency || fallbackCurrency);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await providerPortalFetch(exportHref, { credentials: "include" });
      if (!response.ok) {
        throw new Error(t("web.provider.settings.pages.billing.failedToLoadBillingInformationFallback"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "bills-paid.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("web.provider.settings.pages.billing.failedToLoadBillingInformationFallback"));
    } finally {
      setExporting(false);
    }
  };

  const openReceipt = async (item: BillingHistoryItem) => {
    const url = item.invoice_url?.trim();
    if (!url) return;
    try {
      const name =
        item.type === "platform_invoice"
          ? `invoice-${item.id}.pdf`
          : `receipt-${item.id}.pdf`;
      await openProviderBillingReceipt(url, { filename: name });
    } catch {
      toast.error(t("web.provider.settings.pages.billing.receiptDownloadFailed"));
    }
  };

  if (loading && items.length === 0 && !error) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadPage(0, false)}>
            {t("web.provider.common.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{t("web.provider.settings.pages.billing.billsPaidTypeFilter")}</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("web.provider.settings.pages.billing.billsPaidTypeAll")}</SelectItem>
              <SelectItem value="subscription">{t("web.provider.settings.pages.billing.subscription")}</SelectItem>
              <SelectItem value="ads">{t("web.provider.settings.pages.billing.ads")}</SelectItem>
              <SelectItem value="marketing_credit">{t("web.provider.settings.pages.billing.marketingCredits")}</SelectItem>
              <SelectItem value="platform_invoice">{t("web.provider.settings.pages.billing.platformInvoices")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{t("web.provider.settings.pages.billing.billsPaidDateFrom")}</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">{t("web.provider.settings.pages.billing.billsPaidDateTo")}</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" />
        </div>
        <Button type="button" variant="outline" disabled={exporting} onClick={() => void handleExport()}>
          {exporting ? (
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="me-2 h-4 w-4" />
          )}
          {t("web.provider.settings.pages.billing.exportCsv")}
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t("web.provider.settings.pages.billing.noSubscriptionAdsOrMarketingPayments")}
          description={t("web.provider.settings.pages.billing.noHistoryDescription")}
          icon={CreditCard}
        />
      ) : (
        <>
          <p className="text-sm text-gray-600">
            {t("web.provider.settings.pages.billing.billsPaidCount", { count: total })}
          </p>
          <div className="space-y-3">
            {items.map((item) => {
              const isAds = item.type === "ads";
              const isMarketing = item.type === "marketing_credit";
              const isPlatform = item.type === "platform_invoice";
              const typeLabel = isPlatform
                ? t("web.provider.settings.pages.billing.platformInvoices")
                : isMarketing
                  ? t("web.provider.settings.pages.billing.marketingCredits")
                  : isAds
                    ? t("web.provider.settings.pages.billing.ads")
                    : t("web.provider.settings.pages.billing.subscription");
              const fallbackLabel = isPlatform
                ? t("web.provider.settings.pages.billing.platformInvoicePayment")
                : isMarketing
                  ? t("web.provider.settings.pages.billing.marketingCreditTopUp")
                  : isAds
                    ? t("web.provider.settings.pages.billing.adsCampaignPayment")
                    : t("web.provider.settings.pages.billing.subscriptionPayment");
              const iconClasses = isPlatform
                ? "bg-violet-50 text-violet-700"
                : isMarketing
                  ? "bg-emerald-50 text-emerald-700"
                  : isAds
                    ? "bg-amber-50 text-amber-700"
                    : "bg-indigo-50 text-indigo-700";
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClasses}`}
                    >
                      {isAds ? <CreditCard className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{item.description || fallbackLabel}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(item.created_at).toLocaleDateString()} · {typeLabel}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(item.amount, item.currency)}
                    </span>
                    <Badge variant="secondary">{formatStatusLabel(item.status)}</Badge>
                    {item.invoice_url ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void openReceipt(item)}
                      >
                        <FileText className="h-3.5 w-3.5 me-1" />
                        {t("web.provider.settings.pages.billing.receipt")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {hasMore ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loadingMore}
              onClick={() => {
                const next = offset + LIMIT;
                setOffset(next);
                void loadPage(next, true);
              }}
            >
              {loadingMore ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("web.provider.settings.pages.billing.billsPaidLoadMore")}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
