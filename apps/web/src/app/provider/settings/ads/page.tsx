"use client";

import { useTranslation } from "@beautonomi/i18n";
import { getDefaultMoneyLocale } from "@beautonomi/utils";
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { fetcher } from "@/lib/http/fetcher";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Pause,
  Play,
  MousePointer,
  Eye,
  Users,
  Banknote,
  Check,
  Megaphone,
  ShieldCheck,
  Lock,
} from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AdsPlacementPreview } from "@/components/provider/ads/AdsPlacementPreview";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";

type CampaignPaymentState = "none" | "unpaid" | "pending" | "failed" | "paid";

type CampaignLifecycle =
  | "awaiting_payment"
  | "confirming"
  | "payment_failed"
  | "active"
  | "paused"
  | "budget_exhausted"
  | "expired"
  | "delivered"
  | "cancelled";

type Campaign = {
  id: string;
  status: string;
  budget: number;
  spent: number;
  daily_budget?: number | null;
  bid_cpc?: number;
  pack_impressions?: number | null;
  billing_model?: string;
  duration_days?: number | null;
  start_at: string | null;
  end_at: string | null;
  targeting?: { global_category_ids?: string[] };
  created_at: string;
  /** §Provider-paystack-audit 2026-05: server-derived payment recovery state. */
  payment_state?: CampaignPaymentState;
  lifecycle?: CampaignLifecycle;
  latest_budget_order?: {
    id: string;
    status: string;
    amount: number;
    currency: string | null;
    created_at?: string;
  } | null;
};

type GlobalCategory = { id: string; name: string; slug: string };

function isTimeBasedCampaign(campaign: Campaign | null): boolean {
  return campaign?.billing_model === "time_based";
}

function isImpressionPackCampaign(campaign: Campaign | null): boolean {
  return Boolean(
    campaign && campaign.billing_model !== "time_based" && campaign.pack_impressions != null
  );
}

function canEditBudgetFields(campaign: Campaign | null): boolean {
  return Boolean(campaign && !isTimeBasedCampaign(campaign) && !isImpressionPackCampaign(campaign));
}

function normalizeCategories(raw: unknown): GlobalCategory[] {
  if (Array.isArray(raw)) return raw as GlobalCategory[];
  if (!raw || typeof raw !== "object") return [];
  const root = raw as { data?: unknown; categories?: unknown; global_categories?: unknown };
  if (Array.isArray(root.data)) return root.data as GlobalCategory[];
  if (Array.isArray(root.categories)) return root.categories as GlobalCategory[];
  if (Array.isArray(root.global_categories)) return root.global_categories as GlobalCategory[];
  if (
    root.data &&
    typeof root.data === "object" &&
    Array.isArray((root.data as { categories?: unknown }).categories)
  ) {
    return (root.data as { categories: GlobalCategory[] }).categories;
  }
  return [];
}

/** Display status: treat exhausted windows/budgets as ended before cron/DB catch up. */
function effectiveCampaignStatus(
  campaign: Campaign,
  nowMs: number,
  metrics?: CampaignPerformance
): string {
  const base = campaign.status;
  if (base !== "active") return base;

  if (
    campaign.billing_model === "time_based" &&
    campaign.end_at &&
    new Date(campaign.end_at).getTime() <= nowMs
  ) {
    return "ended";
  }

  const packCap =
    isImpressionPackCampaign(campaign) && campaign.pack_impressions != null
      ? Number(campaign.pack_impressions)
      : null;
  if (packCap != null && packCap > 0 && metrics && Number(metrics.impressions ?? 0) >= packCap) {
    return "ended";
  }

  const budget = Number(campaign.budget || 0);
  if (
    campaign.billing_model === "cpc_budget" &&
    budget > 0 &&
    Number(campaign.spent ?? 0) >= budget
  ) {
    return "ended";
  }

  return base;
}

function campaignProgress(
  campaign: Campaign,
  nowMs: number,
  metrics?: CampaignPerformance
): number {
  if (isImpressionPackCampaign(campaign) && campaign.pack_impressions != null && metrics) {
    const cap = Number(campaign.pack_impressions);
    if (cap <= 0) return 0;
    return Math.max(0, Math.min(1, Number(metrics.impressions ?? 0) / cap));
  }
  if (campaign.billing_model === "time_based" && campaign.start_at && campaign.end_at) {
    const start = new Date(campaign.start_at).getTime();
    const end = new Date(campaign.end_at).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(0, Math.min(1, (nowMs - start) / (end - start)));
    }
  }
  const budget = Number(campaign.budget || 0);
  if (budget <= 0) return 0;
  return Math.max(0, Math.min(1, Number(campaign.spent || 0) / budget));
}

function campaignModelLabel(campaign: Campaign, t: (key: string) => string): string {
  if (isTimeBasedCampaign(campaign)) return t("web.provider.settings.pages.ads.timeBoostLower");
  if (isImpressionPackCampaign(campaign)) return t("web.provider.settings.pages.ads.impressionPackLower");
  return t("web.provider.settings.pages.ads.cpcBudget");
}

type PerformanceSummary = {
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
};

type CampaignPerformance = {
  impressions: number;
  reach: number;
  clicks: number;
  books: number;
  spent: number;
};

const formatCompactNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat(getDefaultMoneyLocale(), { maximumFractionDigits: 0 }).format(Number(value ?? 0));

const formatCtr = (impressions: number, clicks: number): string => {
  const denom = Number(impressions || 0);
  if (denom <= 0) return "—";
  const ctr = (Number(clicks || 0) / denom) * 100;
  if (!Number.isFinite(ctr)) return "—";
  return `${ctr >= 10 ? ctr.toFixed(0) : ctr.toFixed(1)}%`;
};

const PENDING_ORDER_FRESH_MS = 30 * 60 * 1000;

function isFreshPendingOrder(order: Campaign["latest_budget_order"]): boolean {
  if (!order || order.status !== "pending") return false;
  if (!order.created_at) return true;
  return Date.now() - new Date(order.created_at).getTime() < PENDING_ORDER_FRESH_MS;
}

function getLifecycleBadge(
  t: (key: string) => string,
): Record<CampaignLifecycle, { label: string; className: string }> {
  return {
    awaiting_payment: { label: t("web.provider.settings.pages.ads.awaitingPayment"), className: "border-amber-300 text-amber-700" },
    confirming: { label: t("web.provider.settings.pages.ads.confirmingPayment"), className: "border-blue-300 text-blue-700" },
    payment_failed: { label: t("web.provider.settings.pages.ads.paymentFailed"), className: "border-red-300 text-red-700" },
    active: { label: t("web.provider.settings.pages.ads.active"), className: "border-emerald-300 text-emerald-700" },
    paused: { label: t("web.provider.settings.pages.ads.paused"), className: "border-amber-300 text-amber-800" },
    budget_exhausted: { label: t("web.provider.settings.pages.ads.budgetExhausted"), className: "border-slate-300 text-slate-700" },
    expired: { label: t("web.provider.settings.pages.ads.expired"), className: "border-slate-300 text-slate-700" },
    delivered: { label: t("web.provider.settings.pages.ads.delivered"), className: "border-slate-300 text-slate-700" },
    cancelled: { label: t("web.provider.settings.pages.ads.cancelled"), className: "border-slate-300 text-slate-600" },
  };
}

function isPastCampaign(lifecycle: CampaignLifecycle | undefined): boolean {
  return (
    lifecycle === "budget_exhausted" ||
    lifecycle === "expired" ||
    lifecycle === "delivered" ||
    lifecycle === "cancelled"
  );
}

type ImpressionPack = { id: string; impressions: number; price_zar: number; display_order: number };
type TimePack = {
  id: string;
  duration_days: number;
  label: string;
  price_zar: number;
  display_order: number;
};

export default function ProviderAdsPage() {
  const { t } = useTranslation();
  const { currencyCode, format: fmt } = useReportCurrency();
  const searchParams = useSearchParams();
  const { provider } = useProviderPortal();
  const adsConfig = useModuleConfig("ads") as { enabled?: boolean } | undefined;
  const adsEnabled = useFeatureFlag("ads.enabled");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null);
  const [campaignPerformance, setCampaignPerformance] = useState<
    Record<string, CampaignPerformance>
  >({});
  const [packs, setPacks] = useState<ImpressionPack[]>([]);
  const [timePacks, setTimePacks] = useState<TimePack[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("time_based");
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingPackId, setCreatingPackId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [paymentConfirmedBanner, setPaymentConfirmedBanner] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  // §Ads-enterprise-hardening 2026-06: world-class web checkout. A review modal
  // (price breakdown + what-you-get + Sponsored disclosure + charged-after-
  // confirm note) replaces the immediate redirect-and-toast, and a redirecting
  // state covers the hop to Paystack so the click never feels unacknowledged.
  const [checkoutReview, setCheckoutReview] = useState<{
    heading: string;
    title: string;
    subtitle?: string;
    benefits: string[];
    lineItems: { label: string; value: string }[];
    total: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [showEndedCampaigns, setShowEndedCampaigns] = useState(false);
  const [form, setForm] = useState({
    budget: "",
    daily_budget: "",
    bid_cpc: "",
    global_category_ids: [] as string[],
  });
  const [createForm, setCreateForm] = useState({
    budget: "",
    daily_budget: "",
    bid_cpc: "",
    global_category_ids: [] as string[],
  });

  const enabled = Boolean(adsConfig?.enabled) || adsEnabled;
  const cpcBudgetAvailable = availableModels.length === 0 || availableModels.includes("cpc_budget");

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: Campaign[] }>("/api/provider/ads/campaigns");
      setCampaigns(res.data ?? []);
      setNowMs(Date.now());
    } catch {
      setCampaigns([]);
      toast.error(t("web.provider.settings.pages.ads.failedToLoadCampaignsPleaseTry"));
    }
  }, []);

  const loadPerformance = useCallback(async () => {
    try {
      const res = await fetcher.get<{
        data: { summary: PerformanceSummary; by_campaign?: Record<string, CampaignPerformance> };
      }>("/api/provider/ads/performance");
      setPerformance(res.data?.summary ?? null);
      setCampaignPerformance(res.data?.by_campaign ?? {});
    } catch {
      setPerformance(null);
      setCampaignPerformance({});
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      await Promise.all([loadCampaigns(), loadPerformance()]);
      try {
        const [catRes, packsRes] = await Promise.all([
          fetcher.get<{ data: GlobalCategory[] }>("/api/public/categories/global?all=true"),
          fetcher.get<{
            data: {
              impression_packs: ImpressionPack[];
              time_packs: TimePack[];
              available_models: string[];
              default_model?: string;
            };
          }>("/api/provider/ads/packs"),
        ]);
        setGlobalCategories(normalizeCategories(catRes.data));
        const packsData = packsRes.data;
        if (packsData && typeof packsData === "object" && !Array.isArray(packsData)) {
          setPacks(Array.isArray(packsData.impression_packs) ? packsData.impression_packs : []);
          setTimePacks(Array.isArray(packsData.time_packs) ? packsData.time_packs : []);
          setAvailableModels(
            Array.isArray(packsData.available_models) ? packsData.available_models : []
          );
          setDefaultModel(
            typeof packsData.default_model === "string" ? packsData.default_model : "time_based"
          );
        } else {
          setPacks(Array.isArray(packsData) ? (packsData as any) : []);
        }
      } catch {
        setGlobalCategories([]);
        setPacks([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [enabled, loadCampaigns, loadPerformance]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNowMs(Date.now());
    const id = setInterval(tick, 60_000);
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        tick();
        void loadCampaigns();
        void loadPerformance();
      }
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, loadCampaigns, loadPerformance]);

  useEffect(() => {
    if (!enabled || !provider?.id) return;
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) return;
    const channel = supabaseClient
      .channel(`ads-campaigns:${provider.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ads_campaigns",
          filter: `provider_id=eq.${provider.id}`,
        },
        () => {
          void loadCampaigns();
          void loadPerformance();
        },
      )
      .subscribe();
    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [enabled, provider?.id, loadCampaigns, loadPerformance]);

  useEffect(() => {
    if (searchParams.get("payment_success") === "1") {
      setPaymentConfirmedBanner(true);
      // §Provider-paystack-audit 2026-05: campaigns auto-activate as soon as
      // `handleAdsBudgetOrderSuccess` lands (CPC included), so the banner copy
      // no longer instructs providers to "tap Activate" — that was misleading.
      toast.success(t("web.provider.settings.pages.ads.paymentConfirmedYourCampaignIsBeing"));
      void loadCampaigns();
      void loadPerformance();
      // Defensive refresh retries to avoid transient stale status immediately post-verify.
      const t1 = window.setTimeout(() => {
        void loadCampaigns();
        void loadPerformance();
      }, 1200);
      const t2 = window.setTimeout(() => {
        void loadCampaigns();
        void loadPerformance();
      }, 2600);
      window.history.replaceState({}, "", "/provider/settings/ads");
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
  }, [searchParams, loadCampaigns, loadPerformance]);

  const createDraft = () => {
    const num = parseFloat(createForm.budget);
    if (!Number.isFinite(num) || num < 0) {
      toast.error(t("web.provider.settings.pages.ads.enterAValidTotalBudget"));
      return;
    }
    if (num <= 0) {
      // No payment needed — create the free draft immediately.
      void runCreateDraft();
      return;
    }
    const dailyCap = createForm.daily_budget ? parseFloat(createForm.daily_budget) : null;
    const bidCpc = createForm.bid_cpc ? parseFloat(createForm.bid_cpc) : 0;
    const lineItems = [{ label: t("web.provider.settings.pages.ads.campaignBudget"), value: fmt(num) }];
    if (dailyCap && Number.isFinite(dailyCap) && dailyCap > 0) {
      lineItems.push({ label: t("web.provider.settings.pages.ads.dailyCap"), value: fmt(dailyCap) });
    }
    if (bidCpc && Number.isFinite(bidCpc) && bidCpc > 0) {
      lineItems.push({ label: t("web.provider.settings.pages.ads.bidPerClick"), value: t("web.provider.settings.pages.ads.bidPerClickValue", { amount: fmt(bidCpc) }) });
    }
    lineItems.push({ label: t("web.provider.settings.pages.ads.totalDue"), value: fmt(num) });
    setCheckoutReview({
heading: t("web.provider.settings.pages.ads.cpcBudget"),
      title: t("web.provider.settings.pages.ads.campaignBudgetTitle", { amount: fmt(num) }),
subtitle: t("web.provider.settings.pages.ads.cpcSubtitle"),
      benefits: [
        t("web.provider.settings.pages.ads.benefitSponsoredPlacement"),
        t("web.provider.settings.pages.ads.benefitPayAsClicks"),
        t("web.provider.settings.pages.ads.benefitPauseAnytime"),
      ],
      lineItems,
      total: fmt(num),
      confirmLabel: t("web.provider.settings.pages.ads.payAmount", { amount: fmt(num) }),
      run: runCreateDraft,
    });
  };

  const runCreateDraft = async () => {
    const num = parseFloat(createForm.budget);
    if (!Number.isFinite(num) || num < 0) {
      toast.error(t("web.provider.settings.pages.ads.enterAValidTotalBudget"));
      return;
    }
    setCreating(true);
    try {
      const res = await fetcher.post<{
        data:
          | Campaign
          | {
              campaign: Campaign;
              requires_payment: boolean;
              payment_url: string | null;
              order_id: string;
            };
      }>("/api/provider/ads/campaigns", {
        budget: num,
        daily_budget: createForm.daily_budget ? parseFloat(createForm.daily_budget) : null,
        bid_cpc: createForm.bid_cpc ? parseFloat(createForm.bid_cpc) : 0,
        targeting: {
          global_category_ids:
            createForm.global_category_ids.length > 0 ? createForm.global_category_ids : undefined,
        },
      });
      const data = res.data as any;
      const campaign = data?.campaign ?? data;
      setCampaigns((prev) => [campaign, ...prev]);
      setCreateForm({ budget: "", daily_budget: "", bid_cpc: "", global_category_ids: [] });
      if (data?.requires_payment && data?.payment_url) {
        toast.success(t("web.provider.settings.pages.ads.redirectingToPaymentCompletePaymentTo"));
        window.location.href = data.payment_url;
        return;
      }
      toast.success(t("web.provider.settings.pages.ads.campaignCreatedDraftActivateItWhen"));
    } catch {
      toast.error(t("web.provider.settings.pages.ads.failedToCreateCampaign"));
    } finally {
      setCreating(false);
    }
  };

  const buyPack = (pack: ImpressionPack) => {
    setCheckoutReview({
heading: t("web.provider.settings.pages.ads.impressionPack"),
      title: t("web.provider.settings.pages.ads.impressionPackTitle", { value: formatCompactNumber(pack.impressions) }),
subtitle: t("web.provider.settings.pages.ads.impressionPackSubtitle"),
      benefits: [
        t("web.provider.settings.pages.ads.benefitGuaranteedImpressions", { value: formatCompactNumber(pack.impressions) }),
        t("web.provider.settings.pages.ads.benefitDeliveryAfterPayment"),
        t("web.provider.settings.pages.ads.benefitNoBidding"),
      ],
      lineItems: [
        { label: t("web.provider.settings.pages.ads.impressionPack"), value: formatCompactNumber(pack.impressions) },
        { label: t("web.provider.settings.pages.ads.totalDue"), value: fmt(Number(pack.price_zar)) },
      ],
      total: fmt(Number(pack.price_zar)),
      confirmLabel: t("web.provider.settings.pages.ads.payAmount", { amount: fmt(Number(pack.price_zar)) }),
      run: () => runBuyPack(pack),
    });
  };

  const runBuyPack = async (pack: ImpressionPack) => {
    setCreatingPackId(pack.id);
    try {
      const res = await fetcher.post<{
        data:
          | Campaign
          | {
              campaign: Campaign;
              requires_payment: boolean;
              payment_url: string | null;
              order_id: string;
            };
      }>("/api/provider/ads/campaigns", {
        impression_pack_id: pack.id,
        targeting: {
          global_category_ids:
            createForm.global_category_ids.length > 0 ? createForm.global_category_ids : undefined,
        },
      });
      const data = res.data as any;
      const campaign = data?.campaign ?? data;
      setCampaigns((prev) => [campaign, ...prev]);
      if (data?.requires_payment && data?.payment_url) {
        toast.success(t("web.provider.settings.pages.ads.redirectingImpressions", { count: pack.impressions }));
        window.location.href = data.payment_url;
        return;
      }
      toast.success(t("web.provider.settings.pages.ads.campaignCreated"));
    } catch {
      toast.error(t("web.provider.settings.pages.ads.failedToCreateCampaign"));
    } finally {
      setCreatingPackId(null);
    }
  };

  const runBuyTimePack = async (tp: TimePack) => {
    setCreatingPackId(tp.id);
    try {
      const targeting =
        createForm.global_category_ids.length > 0
          ? { global_category_ids: createForm.global_category_ids }
          : {};
      const res = await fetcher.post<{
        data: Campaign | { campaign: Campaign; requires_payment?: boolean; payment_url?: string | null };
      }>("/api/provider/ads/campaigns", { time_pack_id: tp.id, targeting });
      const payload = res.data as {
        payment_url?: string | null;
        requires_payment?: boolean;
        campaign?: Campaign;
      };
      if (payload?.requires_payment && payload?.payment_url) {
        toast.success(t("web.provider.settings.pages.ads.redirectingToSecurePayment"));
        window.location.href = payload.payment_url;
        return;
      }
      toast.success(t("web.provider.settings.pages.ads.campaignCreated"));
      loadCampaigns();
    } catch {
      toast.error(t("web.provider.settings.pages.ads.failedToCreateCampaign"));
    } finally {
      setCreatingPackId(null);
    }
  };

  const openTimePackReview = (tp: TimePack) => {
    const daysLabel = t("web.provider.settings.pages.ads.dayCount", { count: tp.duration_days });
    setCheckoutReview({
heading: t("web.provider.settings.pages.ads.timeBoost"),
      title: tp.label?.trim() ? tp.label : t("web.provider.settings.pages.ads.daysBoost", { days: daysLabel }),
      subtitle: t("web.provider.settings.pages.ads.timeBoostSubtitle", { days: daysLabel }),
      benefits: [
        t("web.provider.settings.pages.ads.benefitSponsoredDuration", { days: daysLabel }),
        t("web.provider.settings.pages.ads.benefitFlatPrice"),
        t("web.provider.settings.pages.ads.benefitGoesLiveAfterPayment"),
      ],
      lineItems: [
        { label: t("web.provider.settings.pages.ads.boostDuration"), value: daysLabel },
        { label: t("web.provider.settings.pages.ads.totalDue"), value: fmt(Number(tp.price_zar)) },
      ],
      total: fmt(Number(tp.price_zar)),
      confirmLabel: t("web.provider.settings.pages.ads.payAmount", { amount: fmt(Number(tp.price_zar)) }),
      run: () => runBuyTimePack(tp),
    });
  };

  const confirmCheckout = async () => {
    if (!checkoutReview) return;
    setCheckoutSubmitting(true);
    try {
      await checkoutReview.run();
    } finally {
      setCheckoutSubmitting(false);
      setCheckoutReview(null);
    }
  };

  const updateCampaign = async () => {
    if (!editCampaign) return;
    const canEditBudget = canEditBudgetFields(editCampaign);
    if (canEditBudget && form.budget) {
      const nextBudget = parseFloat(form.budget);
      if (Number.isFinite(nextBudget) && nextBudget > Number(editCampaign.budget ?? 0)) {
        toast.error(
t("web.provider.settings.pages.ads.budgetIncreaseBlocked")
        );
        return;
      }
    }
    setUpdating(editCampaign.id);
    try {
      const payload: Record<string, unknown> = {
        targeting: { global_category_ids: form.global_category_ids },
      };
      if (canEditBudget) {
        payload.budget = form.budget ? parseFloat(form.budget) : undefined;
        payload.daily_budget =
          form.daily_budget === ""
            ? null
            : form.daily_budget
              ? parseFloat(form.daily_budget)
              : undefined;
        payload.bid_cpc = form.bid_cpc ? parseFloat(form.bid_cpc) : undefined;
      }
      await fetcher.patch(`/api/provider/ads/campaigns/${editCampaign.id}`, payload);
      await loadCampaigns();
      setEditCampaign(null);
      toast.success(t("web.provider.settings.pages.ads.campaignUpdated"));
    } catch (err) {
toast.error(formatApiErrorMessage(err, t("web.provider.settings.pages.ads.failedToUpdateCampaign")));
    } finally {
      setUpdating(null);
    }
  };

  const setStatus = async (campaignId: string, status: "active" | "paused" | "ended") => {
    setUpdating(campaignId);
    try {
      await fetcher.patch(`/api/provider/ads/campaigns/${campaignId}`, { status });
      await loadCampaigns();
      toast.success(
        status === "active"
          ? t("web.provider.settings.pages.ads.campaignActivated")
          : status === "paused"
            ? t("web.provider.settings.pages.ads.campaignPaused")
            : t("web.provider.settings.pages.ads.campaignEnded")
      );
    } catch (err) {
toast.error(formatApiErrorMessage(err, t("web.provider.settings.pages.ads.failedToUpdateStatus")));
    } finally {
      setUpdating(null);
    }
  };

  /**
   * §Provider-paystack-audit 2026-05: re-open Paystack for an unpaid or failed
   * draft campaign without creating a duplicate. Mirrors the mobile flow so
   * recovery actions stay in sync between platforms.
   */
  const retryCampaignPayment = async (campaign: Campaign) => {
    setUpdating(campaign.id);
    try {
      const res = await fetcher.post<{ data?: { payment_url?: string | null } }>(
        `/api/provider/ads/campaigns/${campaign.id}/checkout`,
        {}
      );
      const url = res.data?.payment_url ?? null;
      if (!url) {
        toast.error(t("web.provider.settings.pages.ads.couldnTReopenPaystackPleaseTry"));
        return;
      }
      window.location.assign(url);
    } catch (err) {
toast.error(formatApiErrorMessage(err, t("web.provider.settings.pages.ads.couldntReopenPaystack")));
    } finally {
      setUpdating(null);
    }
  };

  const cancelDraftCampaign = async (campaign: Campaign) => {
    if (
      typeof window !== "undefined" &&
!window.confirm(t("web.provider.settings.pages.ads.cancelDraftConfirm"))
    ) {
      return;
    }
    await setStatus(campaign.id, "ended");
  };

  const abandonPendingOrder = async (campaign: Campaign) => {
    const orderId = campaign.latest_budget_order?.id;
    if (!orderId) return;
    setUpdating(campaign.id);
    try {
      await fetcher.post(`/api/provider/ads/budget-orders/${orderId}/abandon`, {});
      await loadCampaigns();
      toast.success(t("web.provider.settings.pages.ads.paymentCancelledYouCanTryAgain"));
    } catch (err) {
toast.error(formatApiErrorMessage(err, t("web.provider.settings.pages.ads.couldntCancelPayment")));
    } finally {
      setUpdating(null);
    }
  };

  const viewCampaignReceipt = async (campaign: Campaign) => {
    const orderId = campaign.latest_budget_order?.id;
    if (!orderId) {
      toast.error(t("web.provider.settings.pages.ads.noPaidOrderFoundForThis"));
      return;
    }
    setUpdating(campaign.id);
    try {
      const res = await fetcher.post<{ data?: { url?: string } }>(
        `/api/provider/ads/orders/${orderId}/receipt/signed-url`,
        {},
      );
      const url = res.data?.url;
      if (!url) {
        toast.error(t("web.provider.settings.pages.ads.couldnTOpenTheReceipt"));
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
toast.error(formatApiErrorMessage(err, t("web.provider.settings.pages.ads.couldntOpenReceipt")));
    } finally {
      setUpdating(null);
    }
  };

  const buyAgainCampaign = (campaign: Campaign) => {
    setCreateForm({
      budget: String(campaign.budget ?? ""),
      daily_budget: campaign.daily_budget != null ? String(campaign.daily_budget) : "",
      bid_cpc: campaign.bid_cpc != null ? String(campaign.bid_cpc) : "",
      global_category_ids: campaign.targeting?.global_category_ids ?? [],
    });
    if (isTimeBasedCampaign(campaign)) {
toast.message(t("web.provider.settings.pages.ads.pickTimeBoost"));
      return;
    }
    if (isImpressionPackCampaign(campaign)) {
toast.message(t("web.provider.settings.pages.ads.pickImpressionPack"));
      return;
    }
    createDraft();
  };

  const openEdit = (c: Campaign) => {
    setEditCampaign(c);
    setForm({
      budget: String(c.budget ?? ""),
      daily_budget: c.daily_budget != null ? String(c.daily_budget) : "",
      bid_cpc: c.bid_cpc != null ? String(c.bid_cpc) : "",
      global_category_ids: c.targeting?.global_category_ids ?? [],
    });
  };

  if (loading) {
    return (
      <SettingsDetailLayout title={t("web.provider.settings.categories.marketingIntegrations.items.paidAds.title")} subtitle={t("web.provider.settings.categories.marketingIntegrations.items.paidAds.description")}>
        <LoadingTimeout loadingMessage={t("common.loading")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.marketingIntegrations.items.paidAds.title")}
      subtitle={t("web.provider.settings.categories.marketingIntegrations.items.paidAds.description")}
    >
      {!enabled && (
        <Alert className="mb-6">
          <AlertDescription>
{t("web.provider.settings.pages.ads.sponsoredUnavailable")}
          </AlertDescription>
        </Alert>
      )}

      {paymentConfirmedBanner && enabled && (
        <Alert className="mb-6 border-emerald-200 bg-emerald-50 text-emerald-950">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* §Provider-paystack-audit 2026-05: server-side webhook activates
              the campaign as soon as the order is paid, so the banner now
              reflects that automatically rather than asking providers to tap
              Activate (CPC campaigns are flipped to active by the webhook). */}
            <span>
<strong>{t("web.provider.settings.pages.ads.paymentConfirmedStrong")}</strong> {t("web.provider.settings.pages.ads.paymentConfirmedBody")}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href="/provider/settings/billing"
                className="inline-flex items-center rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
{t("web.provider.settings.pages.ads.viewReceipt")}
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-emerald-300"
                onClick={() => setPaymentConfirmedBanner(false)}
              >
{t("web.provider.common.dismiss")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Ad Performance Dashboard */}
      {enabled && performance && (
        <SectionCard title={t("web.provider.settings.pages.ads.adPerformance")} className="mb-6">
          <p className="text-sm text-muted-foreground mb-4">
{t("web.provider.settings.pages.ads.adPerformanceHint")}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <Eye className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">
                  {formatCompactNumber(performance.impressions)}
                </p>
<p className="text-xs text-muted-foreground">{t("web.provider.settings.pages.ads.impressions")}</p>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">{formatCompactNumber(performance.reach)}</p>
<p className="text-xs text-muted-foreground">{t("web.provider.settings.pages.ads.reach")}</p>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <MousePointer className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">{formatCompactNumber(performance.clicks)}</p>
<p className="text-xs text-muted-foreground">{t("web.provider.settings.pages.ads.clicks")}</p>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <Banknote className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">{fmt(Number(performance.spend))}</p>
<p className="text-xs text-muted-foreground">{t("web.provider.settings.pages.ads.spend")}</p>
              </div>
            </div>
          </div>
          {campaigns.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-lg border">
              <div className="grid grid-cols-5 gap-3 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
<span className="col-span-2">{t("web.provider.settings.pages.ads.campaign")}</span>
<span>{t("web.provider.settings.pages.ads.impr")}</span>
<span>{t("web.provider.settings.pages.ads.clicks")}</span>
<span>{t("web.provider.settings.pages.ads.spend")}</span>
              </div>
              {campaigns.map((campaign) => {
                const metrics = campaignPerformance[campaign.id] ?? {
                  impressions: 0,
                  reach: 0,
                  clicks: 0,
                  books: 0,
                  spent: Number(campaign.spent ?? 0),
                };
                return (
                  <div
                    key={campaign.id}
                    className="grid grid-cols-5 gap-3 border-t px-4 py-3 text-sm"
                  >
                    <div className="col-span-2 min-w-0">
                      <p className="truncate font-medium capitalize">
                        {campaignModelLabel(campaign, t)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{campaign.id}</p>
                    </div>
                    <span>{formatCompactNumber(metrics.impressions)}</span>
                    <span>{formatCompactNumber(metrics.clicks)}</span>
                    <span>{fmt(Number(metrics.spent ?? 0))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title={t("web.provider.settings.pages.ads.campaigns")}>
        <div className="space-y-4">
          {campaigns.some((c) => isPastCampaign(c.lifecycle)) ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {showEndedCampaigns
                  ? t("web.provider.settings.pages.ads.showingActiveAndPast")
                  : t("web.provider.settings.pages.ads.pastCampaignsHidden")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowEndedCampaigns((v) => !v)}
              >
{showEndedCampaigns ? t("web.provider.settings.pages.ads.hidePastCampaigns") : t("web.provider.settings.pages.ads.showPastCampaigns")}
              </Button>
            </div>
          ) : null}
          {enabled && (
            <>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="font-medium text-indigo-950">
{t("web.provider.settings.pages.ads.chooseAdProduct")}
                </p>
                <p className="mt-1 text-sm text-indigo-900/75">
                  {defaultModel === "time_based"
                    ? t("web.provider.settings.pages.ads.recommendedTime")
                    : defaultModel === "impression_pack"
                      ? t("web.provider.settings.pages.ads.recommendedImpression")
                      : t("web.provider.settings.pages.ads.recommendedCpc")}
                </p>
              </div>
              {timePacks.length > 0 && availableModels.includes("time_based") && (
                <div className="mb-6">
                  <div className="flex items-center gap-2">
<Label className="text-base font-medium">{t("web.provider.settings.pages.ads.boostForSetDays")}</Label>
                    {defaultModel === "time_based" ? (
<Badge variant="secondary">{t("web.provider.common.recommended")}</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
{t("web.provider.settings.pages.ads.payFlatRate")}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                    {timePacks.map((tp) => (
                      <div
                        key={tp.id}
                        className="rounded-2xl p-[2px] bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-700 shadow-lg shadow-emerald-500/15"
                      >
                        <button
                          type="button"
                          onClick={() => openTimePackReview(tp)}
                          disabled={creatingPackId !== null}
                          className="w-full rounded-[14px] bg-background p-4 text-start transition hover:bg-muted/40 disabled:opacity-50 min-h-[148px] flex flex-col"
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
{t("web.provider.settings.pages.ads.timeBoost")}
                          </span>
                          <span className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                            {tp.duration_days}
                          </span>
                          <span className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                            {tp.label?.trim()
                              ? tp.label
                              : tp.duration_days === 1
? t("web.provider.settings.pages.ads.dayInSponsoredSlots")
                                : t("web.provider.settings.pages.ads.daysInSponsoredSlots")}
                          </span>
                          <span className="mt-auto pt-3 border-t border-border text-lg font-semibold">
                            {fmt(Number(tp.price_zar))}
                          </span>
                          {creatingPackId === tp.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mt-2 text-emerald-600" />
                          ) : (
                            <span className="text-xs font-semibold text-emerald-600 mt-2">
{t("web.provider.settings.pages.ads.tapToPurchase")}
                            </span>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {packs.length > 0 && availableModels.includes("impression_pack") && (
                <div>
                  <div className="flex items-center gap-2">
<Label className="text-base font-medium">{t("web.provider.settings.pages.ads.buyImpressions")}</Label>
                    {defaultModel === "impression_pack" ? (
<Badge variant="secondary">{t("web.provider.common.recommended")}</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
{t("web.provider.settings.pages.ads.prepaidReach")}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {packs.map((pack) => (
                      <div
                        key={pack.id}
                        className="rounded-2xl p-[2px] bg-gradient-to-br from-violet-600 via-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/15"
                      >
                        <button
                          type="button"
                          onClick={() => buyPack(pack)}
                          disabled={creatingPackId !== null}
                          className="w-full rounded-[14px] bg-background p-4 text-start transition hover:bg-muted/40 disabled:opacity-50 min-h-[148px] flex flex-col"
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">
{t("web.provider.settings.pages.ads.impressionPack")}
                          </span>
                          <span className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                            {formatCompactNumber(pack.impressions)}
                          </span>
                          <span className="text-sm text-muted-foreground mt-0.5">
{t("web.provider.settings.pages.ads.sponsoredImpressions")}
                          </span>
                          <span className="mt-auto pt-3 border-t border-border text-lg font-semibold">
                            {fmt(Number(pack.price_zar))}
                          </span>
                          {creatingPackId === pack.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mt-2 text-violet-600" />
                          ) : (
                            <span className="text-xs font-semibold text-violet-600 mt-2">
{t("web.provider.settings.pages.ads.tapToPurchase")}
                            </span>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
{t("web.provider.settings.pages.ads.optionalTargetCategories")}
                  </p>
                  <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto border rounded p-2 mb-4">
                    {globalCategories.map((cat) => (
                      <label key={cat.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={createForm.global_category_ids.includes(cat.id)}
                          onCheckedChange={(checked) =>
                            setCreateForm((p) => ({
                              ...p,
                              global_category_ids: checked
                                ? [...p.global_category_ids, cat.id]
                                : p.global_category_ids.filter((id) => id !== cat.id),
                            }))
                          }
                        />
                        {cat.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {cpcBudgetAvailable && packs.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2">
<Label className="text-base font-medium">{t("web.provider.settings.pages.ads.orSetCustomBudget")}</Label>
                    {defaultModel === "cpc_budget" ? (
<Badge variant="secondary">{t("web.provider.common.recommended")}</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
{t("web.provider.settings.pages.ads.openEndedBudget")}
                  </p>
                </div>
              )}
              {cpcBudgetAvailable && (
                <div className="flex flex-wrap items-end gap-3 p-4 border rounded-lg bg-muted/30">
                  <div>
<Label>{t("web.provider.settings.pages.ads.totalBudget", { currency: currencyCode })}</Label>
                    <Input
                      type="number"
                      min={0}
                      step={10}
                      value={createForm.budget}
                      onChange={(e) => setCreateForm((p) => ({ ...p, budget: e.target.value }))}
                      placeholder={t("web.provider.settings.pages.ads.n500")}
                      className="w-32"
                    />
                  </div>
                  <div>
<Label>{t("web.provider.settings.pages.ads.dailyBudgetOptional", { currency: currencyCode })}</Label>
                    <Input
                      type="number"
                      min={0}
                      step={10}
                      value={createForm.daily_budget}
                      onChange={(e) =>
                        setCreateForm((p) => ({ ...p, daily_budget: e.target.value }))
                      }
                      placeholder={t("web.provider.settings.pages.ads.noCap")}
                      className="w-32"
                    />
                  </div>
                  <div>
<Label>{t("web.provider.settings.pages.ads.bidPerClickCurrency", { currency: currencyCode })}</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={createForm.bid_cpc}
                      onChange={(e) => setCreateForm((p) => ({ ...p, bid_cpc: e.target.value }))}
                      placeholder={t("web.provider.settings.pages.ads.n200")}
                      className="w-28"
                    />
                  </div>
                  <div className="w-full">
<Label>{t("web.provider.settings.pages.ads.targetCategoriesOptional")}</Label>
                    <div className="flex flex-wrap gap-2 mt-2 max-h-24 overflow-y-auto border rounded p-2">
                      {globalCategories.map((cat) => (
                        <label key={cat.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={createForm.global_category_ids.includes(cat.id)}
                            onCheckedChange={(checked) =>
                              setCreateForm((p) => ({
                                ...p,
                                global_category_ids: checked
                                  ? [...p.global_category_ids, cat.id]
                                  : p.global_category_ids.filter((id) => id !== cat.id),
                              }))
                            }
                          />
                          {cat.name}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
{t("web.provider.settings.pages.ads.adShowsForSelected")}
                    </p>
                  </div>
                  <Button onClick={createDraft} disabled={creating}>
                    {creating ? (
                      <>
<Loader2 className="h-4 w-4 animate-spin me-2" /> {t("web.provider.settings.pages.ads.creating")}
                      </>
                    ) : (
                      <>
<Plus className="h-4 w-4 me-2" /> {t("web.provider.settings.pages.ads.newCampaignDraft")}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}

          {campaigns.filter((c) => showEndedCampaigns || !isPastCampaign(c.lifecycle)).length === 0 ? (
            <p className="text-muted-foreground">
              {campaigns.length === 0
                ? t("web.provider.settings.pages.ads.noCampaignsYet")
                : t("web.provider.settings.pages.ads.noActiveCampaigns")}
            </p>
          ) : (
            <ul className="space-y-3">
              {campaigns
                .filter((c) => showEndedCampaigns || !isPastCampaign(c.lifecycle))
                .map((c) => {
                const metrics = campaignPerformance[c.id] ?? {
                  impressions: 0,
                  reach: 0,
                  clicks: 0,
                  books: 0,
                  spent: Number(c.spent ?? 0),
                };
                const lifecycle = c.lifecycle;
                const lifecycleBadgeInfo =
                  lifecycle && getLifecycleBadge(t)[lifecycle]
                    ? getLifecycleBadge(t)[lifecycle]
                    : null;
                const paymentState = c.payment_state ?? "none";
                const freshPending = paymentState === "pending" && isFreshPendingOrder(c.latest_budget_order);
                const canActivate =
                  (c.status === "draft" || c.status === "paused") &&
                  Number(c.budget) > Number(c.spent ?? 0) &&
                  paymentState === "paid";
                const progress = campaignProgress(c, nowMs, metrics);
                const remaining =
                  c.billing_model === "time_based"
                    ? !c.end_at
? t("web.provider.settings.pages.ads.startsAfterPayment")
                      : new Date(c.end_at).getTime() <= nowMs
? t("web.provider.settings.pages.ads.boostPeriodEnded")
                        : t("web.provider.settings.pages.ads.daysRemaining", { count: Math.max(0, Math.ceil((new Date(c.end_at).getTime() - nowMs) / 86400000)) })
                    : isImpressionPackCampaign(c) && c.pack_impressions != null
                      ? Number(metrics.impressions ?? 0) >= Number(c.pack_impressions)
? t("web.provider.settings.pages.ads.allImpressionsDelivered")
                        : t("web.provider.settings.pages.ads.impressionsRemaining", { value: formatCompactNumber(Math.max(0, Number(c.pack_impressions) - Number(metrics.impressions || 0))) })
                      : Number(c.budget || 0) > 0 && Number(c.spent ?? 0) >= Number(c.budget || 0)
? t("web.provider.settings.pages.ads.budgetFullyUsed")
                        : t("web.provider.settings.pages.ads.budgetRemaining", { amount: fmt(Math.max(0, Number(c.budget || 0) - Number(c.spent || 0))) });
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 border rounded-lg"
                  >
                    <div className="space-y-1 flex-1 min-w-[16rem]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium capitalize">{campaignModelLabel(c, t)}</span>
                        {lifecycleBadgeInfo ? (
                          <Badge variant="outline" className={lifecycleBadgeInfo.className}>
                            {lifecycleBadgeInfo.label}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {c.billing_model === "time_based"
                          ? t("web.provider.settings.pages.ads.dayBoostPaid", { days: c.duration_days ?? t("web.provider.settings.pages.ads.unknownDays"), amount: fmt(Number(c.budget)) }) + (c.end_at ? ` · ${t("web.provider.settings.pages.ads.endsOn", { date: new Date(c.end_at).toLocaleDateString() })}` : "")
                          : c.pack_impressions != null
                            ? t("web.provider.settings.pages.ads.impressionsPaidSpent", { count: c.pack_impressions, paid: fmt(Number(c.budget)), spent: fmt(Number(c.spent)) })
                            : [t("web.provider.settings.pages.ads.totalBudgetSpent", { budget: fmt(Number(c.budget)), spent: fmt(Number(c.spent)) }), c.daily_budget != null ? t("web.provider.settings.pages.ads.dailyCapLine", { amount: fmt(Number(c.daily_budget)) }) : null, c.bid_cpc != null && c.bid_cpc > 0 ? t("web.provider.settings.pages.ads.bidLine", { amount: fmt(Number(c.bid_cpc)) }) : null].filter(Boolean).join(" · ")}
                      </p>
                      {c.targeting?.global_category_ids?.length ? (
                        <p className="text-xs text-muted-foreground">
{t("web.provider.settings.pages.ads.targetingCategory", { count: c.targeting.global_category_ids.length })}
                        </p>
                      ) : null}
                      <div className="max-w-sm pt-2">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${Math.round(progress * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          {remaining}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {[
                          [t("web.provider.settings.pages.ads.impr"), formatCompactNumber(metrics.impressions)],
                          [t("web.provider.settings.pages.ads.reach"), formatCompactNumber(metrics.reach)],
                          [t("web.provider.settings.pages.ads.clicks"), formatCompactNumber(metrics.clicks)],
                          [t("web.provider.settings.pages.ads.ctr"), formatCtr(metrics.impressions, metrics.clicks)],
                          [t("web.provider.settings.pages.ads.bookings"), formatCompactNumber(metrics.books)],
                          [t("web.provider.settings.pages.ads.spend"), fmt(Number(metrics.spent ?? 0))],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs"
                          >
                            <span className="text-muted-foreground">{label}</span>{" "}
                            <span className="font-semibold">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(c)}
                        disabled={updating === c.id}
                      >
{canEditBudgetFields(c) ? t("web.provider.common.edit") : t("web.provider.settings.pages.ads.editTargeting")}
                      </Button>
                      {/* §Provider-paystack-audit 2026-05: surface payment_state
                      so unpaid / failed / pending drafts get explicit actions. */}
                      {paymentState === "unpaid" || paymentState === "failed" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void retryCampaignPayment(c)}
                            disabled={updating === c.id}
                          >
                            {updating === c.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Banknote className="h-4 w-4 me-1" />
                            )}
                            {paymentState === "failed"
                              ? t("web.provider.settings.pages.ads.tryPaymentAgain")
                              : t("web.provider.settings.pages.ads.completePayment")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void cancelDraftCampaign(c)}
                            disabled={updating === c.id}
                          >
{t("web.provider.settings.pages.ads.cancelCampaign")}
                          </Button>
                        </>
                      ) : paymentState === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void retryCampaignPayment(c)}
                            disabled={updating === c.id}
                          >
                            {updating === c.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Banknote className="h-4 w-4 me-1" />
                            )}
{t("web.provider.settings.pages.ads.resumePayment")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void abandonPendingOrder(c)}
                            disabled={updating === c.id}
                          >
{t("web.provider.settings.pages.ads.cancelPayment")}
                          </Button>
                        </>
                      ) : canActivate ? (
                        <Button
                          size="sm"
                          onClick={() => setStatus(c.id, "active")}
                          disabled={updating === c.id}
                        >
                          {updating === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 me-1" />
                          )}
{t("web.provider.settings.pages.ads.activate")}
                        </Button>
                      ) : lifecycle === "active" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setStatus(c.id, "paused")}
                          disabled={updating === c.id}
                        >
                          {updating === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Pause className="h-4 w-4 me-1" />
                          )}
{t("web.provider.settings.pages.ads.pause")}
                        </Button>
                      ) : null}
                      {(paymentState === "paid" || c.latest_budget_order?.status === "paid") &&
                      c.latest_budget_order?.id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void viewCampaignReceipt(c)}
                          disabled={updating === c.id}
                        >
          {t("web.provider.settings.pages.ads.viewReceipt")}
                        </Button>
                      ) : null}
                      {isPastCampaign(lifecycle) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => buyAgainCampaign(c)}
                          disabled={updating === c.id}
                        >
{t("web.provider.settings.pages.ads.buyAgain")}
                        </Button>
                      ) : null}
                      {!isPastCampaign(lifecycle) &&
                      paymentState !== "unpaid" &&
                      paymentState !== "failed" &&
                      !(paymentState === "pending" && freshPending) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStatus(c.id, "ended")}
                          disabled={updating === c.id}
                        >
{t("web.provider.settings.pages.ads.end")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SectionCard>

      {/* Edit campaign dialog */}
      <Dialog open={!!editCampaign} onOpenChange={(open) => !open && setEditCampaign(null)}>
        <DialogContent>
          <DialogHeader>
<DialogTitle>{t("web.provider.settings.pages.ads.editCampaign")}</DialogTitle>
            <DialogDescription>
              {canEditBudgetFields(editCampaign)
                ? t("web.provider.settings.pages.ads.editCampaignBudgetDesc")
                : t("web.provider.settings.pages.ads.editCampaignLockedDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {canEditBudgetFields(editCampaign) ? (
              <>
                <div>
<Label>{t("web.provider.settings.pages.ads.totalBudget", { currency: currencyCode })}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={Number(editCampaign?.budget ?? 0)}
                    value={form.budget}
                    onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
{t("web.provider.settings.pages.ads.budgetLowerHint")}
                  </p>
                </div>
                <div>
<Label>{t("web.provider.settings.pages.ads.dailyBudgetOptional", { currency: currencyCode })}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.daily_budget}
                    onChange={(e) => setForm((p) => ({ ...p, daily_budget: e.target.value }))}
                    placeholder={t("web.provider.settings.pages.ads.noDailyCap")}
                  />
                </div>
                <div>
<Label>{t("web.provider.settings.pages.ads.bidPerClickCurrency", { currency: currencyCode })}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.bid_cpc}
                    onChange={(e) => setForm((p) => ({ ...p, bid_cpc: e.target.value }))}
                  />
                </div>
              </>
            ) : (
              <Alert>
                <AlertDescription>
                  {isTimeBasedCampaign(editCampaign)
                    ? t("web.provider.settings.pages.ads.timeBoostLocked")
                    : t("web.provider.settings.pages.ads.impressionPackLocked")}
                </AlertDescription>
              </Alert>
            )}
            <div>
<Label>{t("web.provider.settings.pages.ads.targetCategories")}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {globalCategories.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.global_category_ids.includes(cat.id)}
                      onCheckedChange={(checked) =>
                        setForm((p) => ({
                          ...p,
                          global_category_ids: checked
                            ? [...p.global_category_ids, cat.id]
                            : p.global_category_ids.filter((id) => id !== cat.id),
                        }))
                      }
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
{t("web.provider.settings.pages.ads.leaveUncheckedAll")}
              </p>
            </div>
          </div>
          <DialogFooter>
<Button variant="outline" onClick={() => setEditCampaign(null)}>
              {t("web.provider.common.cancel")}
            </Button>
            <Button onClick={updateCampaign} disabled={updating === editCampaign?.id}>
              {updating === editCampaign?.id ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : null}
{t("web.provider.common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* §Ads-enterprise-hardening 2026-06: pre-payment review modal — parity
        with the customer product-order review. Shows the price breakdown,
        what-you-get, the Sponsored disclosure, and an explicit charged-only-
        after-confirm note before handing off to the secure Paystack page. */}
      <Dialog
        open={!!checkoutReview}
        onOpenChange={(open) => {
          if (!open && !checkoutSubmitting) setCheckoutReview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
<DialogTitle>{t("web.provider.settings.pages.ads.reviewYourBoost")}</DialogTitle>
            <DialogDescription>
{t("web.provider.settings.pages.ads.reviewBoostDesc")}
            </DialogDescription>
          </DialogHeader>
          {checkoutReview ? (
            <div className="grid gap-4 py-2">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
                  {checkoutReview.heading}
                </p>
                <p className="mt-1 text-lg font-bold text-indigo-950">{checkoutReview.title}</p>
                {checkoutReview.subtitle ? (
                  <p className="mt-1 text-sm text-indigo-900/75">{checkoutReview.subtitle}</p>
                ) : null}
              </div>

              {checkoutReview.benefits.length > 0 ? (
                <ul className="space-y-2">
                  {checkoutReview.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <AdsPlacementPreview
                headline={checkoutReview.title}
                businessName={checkoutReview.subtitle ?? undefined}
              />

              <div className="rounded-lg border p-4">
                {checkoutReview.lineItems.map((item, idx) => {
                  const isTotal = idx === checkoutReview.lineItems.length - 1;
                  return (
                    <div
                      key={item.label}
                      className={`flex items-center justify-between ${idx > 0 ? "mt-2" : ""} ${
                        isTotal ? "mt-3 border-t pt-3" : ""
                      }`}
                    >
                      <span
                        className={
                          isTotal ? "text-sm font-semibold" : "text-sm text-muted-foreground"
                        }
                      >
                        {item.label}
                      </span>
                      <span className={isTotal ? "text-base font-bold" : "text-sm font-medium"}>
                        {item.value}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
{t("web.provider.settings.pages.ads.sponsoredDisclosure")} <strong>{t("web.provider.settings.pages.ads.sponsored")}</strong> {t("web.provider.settings.pages.ads.sponsoredDisclosureRest")}
                </span>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
{t("web.provider.settings.pages.ads.chargedAfterConfirm")}
                </span>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCheckoutReview(null)}
              disabled={checkoutSubmitting}
            >
{t("web.provider.settings.pages.ads.notNow")}
            </Button>
            <Button onClick={() => void confirmCheckout()} disabled={checkoutSubmitting}>
              {checkoutSubmitting ? (
                <>
<Loader2 className="me-2 h-4 w-4 animate-spin" /> {t("web.provider.settings.pages.ads.openingSecureCheckout")}
                </>
              ) : (
                <>
                  <Lock className="me-2 h-4 w-4" /> {checkoutReview?.confirmLabel ?? t("web.provider.settings.pages.ads.paySecurely")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
