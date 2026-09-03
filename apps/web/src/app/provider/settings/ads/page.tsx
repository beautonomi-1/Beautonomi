"use client";

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

function campaignModelLabel(campaign: Campaign): string {
  if (isTimeBasedCampaign(campaign)) return "time boost";
  if (isImpressionPackCampaign(campaign)) return "impression pack";
  return "CPC budget";
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
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value ?? 0));

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

const LIFECYCLE_BADGE: Record<
  CampaignLifecycle,
  { label: string; className: string }
> = {
  awaiting_payment: { label: "Awaiting payment", className: "border-amber-300 text-amber-700" },
  confirming: { label: "Confirming payment", className: "border-blue-300 text-blue-700" },
  payment_failed: { label: "Payment failed", className: "border-red-300 text-red-700" },
  active: { label: "Active", className: "border-emerald-300 text-emerald-700" },
  paused: { label: "Paused", className: "border-amber-300 text-amber-800" },
  budget_exhausted: { label: "Budget exhausted", className: "border-slate-300 text-slate-700" },
  expired: { label: "Expired", className: "border-slate-300 text-slate-700" },
  delivered: { label: "Delivered", className: "border-slate-300 text-slate-700" },
  cancelled: { label: "Cancelled", className: "border-slate-300 text-slate-600" },
};

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
      toast.error("Failed to load campaigns. Please try again.");
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
      toast.success("Payment confirmed. Your campaign is being funded and will go live shortly.");
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
      toast.error("Enter a valid total budget");
      return;
    }
    if (num <= 0) {
      // No payment needed — create the free draft immediately.
      void runCreateDraft();
      return;
    }
    const dailyCap = createForm.daily_budget ? parseFloat(createForm.daily_budget) : null;
    const bidCpc = createForm.bid_cpc ? parseFloat(createForm.bid_cpc) : 0;
    const lineItems = [{ label: "Campaign budget", value: fmt(num) }];
    if (dailyCap && Number.isFinite(dailyCap) && dailyCap > 0) {
      lineItems.push({ label: "Daily cap", value: fmt(dailyCap) });
    }
    if (bidCpc && Number.isFinite(bidCpc) && bidCpc > 0) {
      lineItems.push({ label: "Bid per click", value: `${fmt(bidCpc)}/click` });
    }
    lineItems.push({ label: "Total due", value: fmt(num) });
    setCheckoutReview({
      heading: "CPC budget",
      title: `${fmt(num)} campaign budget`,
      subtitle: "Pay-per-click campaign with full control over spend and bids.",
      benefits: [
        "Sponsored placement in eligible category searches",
        "You only pay as your ad earns clicks",
        "Pause or end anytime — unspent budget stops serving",
      ],
      lineItems,
      total: fmt(num),
      confirmLabel: `Pay ${fmt(num)}`,
      run: runCreateDraft,
    });
  };

  const runCreateDraft = async () => {
    const num = parseFloat(createForm.budget);
    if (!Number.isFinite(num) || num < 0) {
      toast.error("Enter a valid total budget");
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
        toast.success("Redirecting to payment. Complete payment to fund your campaign.");
        window.location.href = data.payment_url;
        return;
      }
      toast.success("Campaign created (draft). Activate it when ready.");
    } catch {
      toast.error("Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  const buyPack = (pack: ImpressionPack) => {
    setCheckoutReview({
      heading: "Impression pack",
      title: `${formatCompactNumber(pack.impressions)} sponsored impressions`,
      subtitle: "Prepaid reach — placements deliver until the pack is fully shown.",
      benefits: [
        `${formatCompactNumber(pack.impressions)} guaranteed sponsored impressions`,
        "Delivery starts only after payment is verified",
        "No bidding or daily caps to manage",
      ],
      lineItems: [
        { label: "Impression pack", value: formatCompactNumber(pack.impressions) },
        { label: "Total due", value: fmt(Number(pack.price_zar)) },
      ],
      total: fmt(Number(pack.price_zar)),
      confirmLabel: `Pay ${fmt(Number(pack.price_zar))}`,
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
        toast.success(`Redirecting to payment for ${pack.impressions} impressions.`);
        window.location.href = data.payment_url;
        return;
      }
      toast.success("Campaign created.");
    } catch {
      toast.error("Failed to create campaign");
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
        toast.success("Redirecting to secure payment…");
        window.location.href = payload.payment_url;
        return;
      }
      toast.success("Campaign created.");
      loadCampaigns();
    } catch {
      toast.error("Failed to create campaign");
    } finally {
      setCreatingPackId(null);
    }
  };

  const openTimePackReview = (tp: TimePack) => {
    const daysLabel = tp.duration_days === 1 ? "1 day" : `${tp.duration_days} days`;
    setCheckoutReview({
      heading: "Time boost",
      title: tp.label?.trim() ? tp.label : `${daysLabel} boost`,
      subtitle: `Flat fee — sponsored placement for ${daysLabel}.`,
      benefits: [
        `Sponsored placement for the full ${daysLabel}`,
        "Predictable flat price — no per-click charges",
        "Goes live only after payment is verified",
      ],
      lineItems: [
        { label: "Boost duration", value: daysLabel },
        { label: "Total due", value: fmt(Number(tp.price_zar)) },
      ],
      total: fmt(Number(tp.price_zar)),
      confirmLabel: `Pay ${fmt(Number(tp.price_zar))}`,
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
          "Budget increases require a new paid campaign or pack. Reduce the budget, or buy a new boost."
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
      toast.success("Campaign updated");
    } catch (err) {
      toast.error(formatApiErrorMessage(err, "Failed to update campaign"));
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
          ? "Campaign activated"
          : status === "paused"
            ? "Campaign paused"
            : "Campaign ended"
      );
    } catch (err) {
      toast.error(formatApiErrorMessage(err, "Failed to update status"));
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
        toast.error("Couldn't reopen Paystack. Please try again.");
        return;
      }
      window.location.assign(url);
    } catch (err) {
      toast.error(formatApiErrorMessage(err, "Couldn't reopen Paystack"));
    } finally {
      setUpdating(null);
    }
  };

  const cancelDraftCampaign = async (campaign: Campaign) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Cancel this draft? No charge was made.")
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
      toast.success("Payment cancelled. You can try again or remove the campaign.");
    } catch (err) {
      toast.error(formatApiErrorMessage(err, "Couldn't cancel the payment"));
    } finally {
      setUpdating(null);
    }
  };

  const viewCampaignReceipt = async (campaign: Campaign) => {
    const orderId = campaign.latest_budget_order?.id;
    if (!orderId) {
      toast.error("No paid order found for this campaign.");
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
        toast.error("Couldn't open the receipt.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(formatApiErrorMessage(err, "Couldn't open the receipt"));
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
      toast.message("Pick a time boost below to run another campaign with the same targeting.");
      return;
    }
    if (isImpressionPackCampaign(campaign)) {
      toast.message("Pick an impression pack below to run another campaign with the same targeting.");
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
      <SettingsDetailLayout title="Paid ads" subtitle="Boost your visibility with sponsored slots.">
        <LoadingTimeout loadingMessage="Loading..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Growth & Marketing — Paid ads"
      subtitle="Boost your profile in high-intent discovery moments, target the categories that matter, and track the visibility, reach, clicks, and bookings your campaigns generate."
    >
      {!enabled && (
        <Alert className="mb-6">
          <AlertDescription>
            Sponsored listings are not available in your market yet. When ads are available, you
            will be able to boost your profile and track visibility, reach, clicks, and bookings
            here.
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
              <strong>Payment confirmed.</strong> Your campaign is now funded and will go live
              shortly. Refresh in a moment if it isn&apos;t showing as active yet.
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href="/provider/settings/billing"
                className="inline-flex items-center rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                View receipt
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-emerald-300"
                onClick={() => setPaymentConfirmedBanner(false)}
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Ad Performance Dashboard */}
      {enabled && performance && (
        <SectionCard title="Ad performance" className="mb-6">
          <p className="text-sm text-muted-foreground mb-4">
            See how many people your ads reached, how often they were shown, and how many customers
            took action.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <Eye className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">
                  {formatCompactNumber(performance.impressions)}
                </p>
                <p className="text-xs text-muted-foreground">Impressions</p>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">{formatCompactNumber(performance.reach)}</p>
                <p className="text-xs text-muted-foreground">Reach</p>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <MousePointer className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">{formatCompactNumber(performance.clicks)}</p>
                <p className="text-xs text-muted-foreground">Clicks</p>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <Banknote className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">{fmt(Number(performance.spend))}</p>
                <p className="text-xs text-muted-foreground">Spend</p>
              </div>
            </div>
          </div>
          {campaigns.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-lg border">
              <div className="grid grid-cols-5 gap-3 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span className="col-span-2">Campaign</span>
                <span>Impr.</span>
                <span>Clicks</span>
                <span>Spend</span>
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
                        {campaignModelLabel(campaign)}
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

      <SectionCard title="Campaigns">
        <div className="space-y-4">
          {campaigns.some((c) => isPastCampaign(c.lifecycle)) ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {showEndedCampaigns
                  ? "Showing active and past campaigns."
                  : "Past campaigns are hidden."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowEndedCampaigns((v) => !v)}
              >
                {showEndedCampaigns ? "Hide past campaigns" : "Show past campaigns"}
              </Button>
            </div>
          ) : null}
          {enabled && (
            <>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="font-medium text-indigo-950">
                  Choose the ad product that matches your goal
                </p>
                <p className="mt-1 text-sm text-indigo-900/75">
                  {defaultModel === "time_based"
                    ? "Recommended: boost for a fixed number of days for predictable visibility."
                    : defaultModel === "impression_pack"
                      ? "Recommended: buy a fixed impression pack and track delivery until it is used."
                      : "Recommended: use a custom CPC budget when you want control over spend, caps, and bids."}
                </p>
              </div>
              {timePacks.length > 0 && availableModels.includes("time_based") && (
                <div className="mb-6">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-medium">Boost for a set number of days</Label>
                    {defaultModel === "time_based" ? (
                      <Badge variant="secondary">Recommended</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Pay a flat rate — your listing stays in sponsored slots for the full duration.
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
                          className="w-full rounded-[14px] bg-background p-4 text-left transition hover:bg-muted/40 disabled:opacity-50 min-h-[148px] flex flex-col"
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                            Time boost
                          </span>
                          <span className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                            {tp.duration_days}
                          </span>
                          <span className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                            {tp.label?.trim()
                              ? tp.label
                              : tp.duration_days === 1
                                ? "day in sponsored slots"
                                : "days in sponsored slots"}
                          </span>
                          <span className="mt-auto pt-3 border-t border-border text-lg font-semibold">
                            {fmt(Number(tp.price_zar))}
                          </span>
                          {creatingPackId === tp.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mt-2 text-emerald-600" />
                          ) : (
                            <span className="text-xs font-semibold text-emerald-600 mt-2">
                              Tap to purchase →
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
                    <Label className="text-base font-medium">Buy impressions</Label>
                    {defaultModel === "impression_pack" ? (
                      <Badge variant="secondary">Recommended</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Prepaid reach — delivery runs until every impression in the pack is shown.
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
                          className="w-full rounded-[14px] bg-background p-4 text-left transition hover:bg-muted/40 disabled:opacity-50 min-h-[148px] flex flex-col"
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">
                            Impression pack
                          </span>
                          <span className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                            {formatCompactNumber(pack.impressions)}
                          </span>
                          <span className="text-sm text-muted-foreground mt-0.5">
                            sponsored impressions
                          </span>
                          <span className="mt-auto pt-3 border-t border-border text-lg font-semibold">
                            {fmt(Number(pack.price_zar))}
                          </span>
                          {creatingPackId === pack.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mt-2 text-violet-600" />
                          ) : (
                            <span className="text-xs font-semibold text-violet-600 mt-2">
                              Tap to purchase →
                            </span>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Optional: select target categories below to show your ad only for those
                    searches. Leave unchecked for all searches.
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
                    <Label className="text-base font-medium">Or set a custom budget</Label>
                    {defaultModel === "cpc_budget" ? (
                      <Badge variant="secondary">Recommended</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Open-ended budget and bid per click (for advanced use).
                  </p>
                </div>
              )}
              {cpcBudgetAvailable && (
                <div className="flex flex-wrap items-end gap-3 p-4 border rounded-lg bg-muted/30">
                  <div>
                    <Label>Total budget ({currencyCode})</Label>
                    <Input
                      type="number"
                      min={0}
                      step={10}
                      value={createForm.budget}
                      onChange={(e) => setCreateForm((p) => ({ ...p, budget: e.target.value }))}
                      placeholder="500"
                      className="w-32"
                    />
                  </div>
                  <div>
                    <Label>Daily budget ({currencyCode}, optional)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={10}
                      value={createForm.daily_budget}
                      onChange={(e) =>
                        setCreateForm((p) => ({ ...p, daily_budget: e.target.value }))
                      }
                      placeholder="No cap"
                      className="w-32"
                    />
                  </div>
                  <div>
                    <Label>Bid per click ({currencyCode})</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={createForm.bid_cpc}
                      onChange={(e) => setCreateForm((p) => ({ ...p, bid_cpc: e.target.value }))}
                      placeholder="2.00"
                      className="w-28"
                    />
                  </div>
                  <div className="w-full">
                    <Label>Target categories (optional)</Label>
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
                      Your ad shows for selected category searches. Leave all unchecked for all
                      searches.
                    </p>
                  </div>
                  <Button onClick={createDraft} disabled={creating}>
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating…
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" /> New campaign (draft)
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
                ? "No campaigns yet. Create a draft to get started."
                : "No active campaigns. Show past campaigns to review ended boosts."}
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
                const lifecycleBadge =
                  lifecycle && LIFECYCLE_BADGE[lifecycle]
                    ? LIFECYCLE_BADGE[lifecycle]
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
                      ? "Starts after payment"
                      : new Date(c.end_at).getTime() <= nowMs
                        ? "Boost period ended"
                        : `${Math.max(0, Math.ceil((new Date(c.end_at).getTime() - nowMs) / 86400000))} days remaining`
                    : isImpressionPackCampaign(c) && c.pack_impressions != null
                      ? Number(metrics.impressions ?? 0) >= Number(c.pack_impressions)
                        ? "All impressions delivered"
                        : `${formatCompactNumber(Math.max(0, Number(c.pack_impressions) - Number(metrics.impressions || 0)))} impressions remaining`
                      : Number(c.budget || 0) > 0 && Number(c.spent ?? 0) >= Number(c.budget || 0)
                        ? "Budget fully used"
                        : `${fmt(Math.max(0, Number(c.budget || 0) - Number(c.spent || 0)))} budget remaining`;
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 border rounded-lg"
                  >
                    <div className="space-y-1 flex-1 min-w-[16rem]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium capitalize">{campaignModelLabel(c)}</span>
                        {lifecycleBadge ? (
                          <Badge variant="outline" className={lifecycleBadge.className}>
                            {lifecycleBadge.label}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {c.billing_model === "time_based"
                          ? `${c.duration_days ?? "?"} day boost · ${fmt(Number(c.budget))} paid${c.end_at ? ` · Ends ${new Date(c.end_at).toLocaleDateString()}` : ""}`
                          : c.pack_impressions != null
                            ? `${c.pack_impressions} impressions · ${fmt(Number(c.budget))} paid · ${fmt(Number(c.spent))} spent`
                            : `Total budget ${fmt(Number(c.budget))} · Spent ${fmt(Number(c.spent))}${c.daily_budget != null ? ` · Daily cap ${fmt(Number(c.daily_budget))}` : ""}${c.bid_cpc != null && c.bid_cpc > 0 ? ` · Bid ${fmt(Number(c.bid_cpc))}/click` : ""}`}
                      </p>
                      {c.targeting?.global_category_ids?.length ? (
                        <p className="text-xs text-muted-foreground">
                          Targeting: {c.targeting.global_category_ids.length} categor
                          {c.targeting.global_category_ids.length === 1 ? "y" : "ies"}
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
                          ["Impr.", formatCompactNumber(metrics.impressions)],
                          ["Reach", formatCompactNumber(metrics.reach)],
                          ["Clicks", formatCompactNumber(metrics.clicks)],
                          ["CTR", formatCtr(metrics.impressions, metrics.clicks)],
                          ["Bookings", formatCompactNumber(metrics.books)],
                          ["Spend", fmt(Number(metrics.spent ?? 0))],
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
                        {canEditBudgetFields(c) ? "Edit" : "Edit targeting"}
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
                              <Banknote className="h-4 w-4 mr-1" />
                            )}
                            {paymentState === "failed"
                              ? "Try payment again"
                              : "Complete payment"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void cancelDraftCampaign(c)}
                            disabled={updating === c.id}
                          >
                            Cancel campaign
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
                              <Banknote className="h-4 w-4 mr-1" />
                            )}
                            Resume payment
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void abandonPendingOrder(c)}
                            disabled={updating === c.id}
                          >
                            Cancel payment
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
                            <Play className="h-4 w-4 mr-1" />
                          )}
                          Activate
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
                            <Pause className="h-4 w-4 mr-1" />
                          )}
                          Pause
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
                          View receipt
                        </Button>
                      ) : null}
                      {isPastCampaign(lifecycle) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => buyAgainCampaign(c)}
                          disabled={updating === c.id}
                        >
                          Buy again
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
                          End
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
            <DialogTitle>Edit campaign</DialogTitle>
            <DialogDescription>
              {canEditBudgetFields(editCampaign)
                ? "Update budget, daily cap, bid, and targeting. Budget increases require a new paid boost."
                : "This campaign was bought as a pack or time boost. Pricing and dates are locked by the platform model, but targeting can still be refined."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {canEditBudgetFields(editCampaign) ? (
              <>
                <div>
                  <Label>Total budget ({currencyCode})</Label>
                  <Input
                    type="number"
                    min={0}
                    max={Number(editCampaign?.budget ?? 0)}
                    value={form.budget}
                    onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    You can lower or re-balance this budget. To add more money, buy a new boost or
                    pack.
                  </p>
                </div>
                <div>
                  <Label>Daily budget ({currencyCode}, optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.daily_budget}
                    onChange={(e) => setForm((p) => ({ ...p, daily_budget: e.target.value }))}
                    placeholder="No daily cap"
                  />
                </div>
                <div>
                  <Label>Bid per click ({currencyCode})</Label>
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
                    ? "Time boosts use the duration and price configured by the marketplace. Buy another boost when you want to extend it."
                    : "Impression packs use the fixed number of impressions and price configured by the marketplace."}
                </AlertDescription>
              </Alert>
            )}
            <div>
              <Label>Target categories</Label>
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
                Leave all unchecked to show for all category searches.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCampaign(null)}>
              Cancel
            </Button>
            <Button onClick={updateCampaign} disabled={updating === editCampaign?.id}>
              {updating === editCampaign?.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save
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
            <DialogTitle>Review your boost</DialogTitle>
            <DialogDescription>
              Confirm the details below. You&apos;re only charged after you approve the payment on the
              secure Paystack page.
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
                  Your listing will appear as a <strong>Sponsored</strong> result in eligible
                  searches while the campaign is funded and active.
                </span>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  You&apos;re only charged after you confirm on Paystack. Your campaign goes live once
                  payment is verified — never before.
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
              Not now
            </Button>
            <Button onClick={() => void confirmCheckout()} disabled={checkoutSubmitting}>
              {checkoutSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening secure checkout…
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" /> {checkoutReview?.confirmLabel ?? "Pay securely"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
