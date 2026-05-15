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
};

type GlobalCategory = { id: string; name: string; slug: string };

function isTimeBasedCampaign(campaign: Campaign | null): boolean {
  return campaign?.billing_model === "time_based";
}

function isImpressionPackCampaign(campaign: Campaign | null): boolean {
  return Boolean(campaign && campaign.billing_model !== "time_based" && campaign.pack_impressions != null);
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
  if (root.data && typeof root.data === "object" && Array.isArray((root.data as { categories?: unknown }).categories)) {
    return (root.data as { categories: GlobalCategory[] }).categories;
  }
  return [];
}

/** Display status: treat exhausted windows/budgets as ended before cron/DB catch up. */
function effectiveCampaignStatus(campaign: Campaign, nowMs: number, metrics?: CampaignPerformance): string {
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

function campaignProgress(campaign: Campaign, nowMs: number, metrics?: CampaignPerformance): number {
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

type ImpressionPack = { id: string; impressions: number; price_zar: number; display_order: number };
type TimePack = { id: string; duration_days: number; label: string; price_zar: number; display_order: number };

export default function ProviderAdsPage() {
  const { currencyCode, format: fmt } = useReportCurrency();
  const searchParams = useSearchParams();
  const adsConfig = useModuleConfig("ads") as { enabled?: boolean } | undefined;
  const adsEnabled = useFeatureFlag("ads.enabled");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null);
  const [campaignPerformance, setCampaignPerformance] = useState<Record<string, CampaignPerformance>>({});
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
          fetcher.get<{ data: { impression_packs: ImpressionPack[]; time_packs: TimePack[]; available_models: string[]; default_model?: string } }>("/api/provider/ads/packs"),
        ]);
        setGlobalCategories(normalizeCategories(catRes.data));
        const packsData = packsRes.data;
        if (packsData && typeof packsData === "object" && !Array.isArray(packsData)) {
          setPacks(Array.isArray(packsData.impression_packs) ? packsData.impression_packs : []);
          setTimePacks(Array.isArray(packsData.time_packs) ? packsData.time_packs : []);
          setAvailableModels(Array.isArray(packsData.available_models) ? packsData.available_models : []);
          setDefaultModel(typeof packsData.default_model === "string" ? packsData.default_model : "time_based");
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
    if (searchParams.get("payment_success") === "1") {
      setPaymentConfirmedBanner(true);
      toast.success(
        "Payment confirmed. Your budget should appear on the campaign below; use Activate for CPC when you are ready to go live.",
      );
      loadCampaigns();
      loadPerformance();
      window.history.replaceState({}, "", "/provider/settings/ads");
    }
  }, [searchParams, loadCampaigns, loadPerformance]);

  const createDraft = async () => {
    const num = parseFloat(createForm.budget);
    if (!Number.isFinite(num) || num < 0) {
      toast.error("Enter a valid total budget");
      return;
    }
    setCreating(true);
    try {
      const res = await fetcher.post<{
        data: Campaign | { campaign: Campaign; requires_payment: boolean; payment_url: string | null; order_id: string };
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

  const buyPack = async (pack: ImpressionPack) => {
    setCreatingPackId(pack.id);
    try {
      const res = await fetcher.post<{
        data: Campaign | { campaign: Campaign; requires_payment: boolean; payment_url: string | null; order_id: string };
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

  const updateCampaign = async () => {
    if (!editCampaign) return;
    const canEditBudget = canEditBudgetFields(editCampaign);
    if (canEditBudget && form.budget) {
      const nextBudget = parseFloat(form.budget);
      if (Number.isFinite(nextBudget) && nextBudget > Number(editCampaign.budget ?? 0)) {
        toast.error("Budget increases require a new paid campaign or pack. Reduce the budget, or buy a new boost.");
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
          form.daily_budget === "" ? null : form.daily_budget ? parseFloat(form.daily_budget) : undefined;
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
      toast.success(status === "active" ? "Campaign activated" : status === "paused" ? "Campaign paused" : "Campaign ended");
    } catch (err) {
      toast.error(formatApiErrorMessage(err, "Failed to update status"));
    } finally {
      setUpdating(null);
    }
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
            Sponsored listings are not available in your market yet. When ads are available, you will be able to boost your
            profile and track visibility, reach, clicks, and bookings here.
          </AlertDescription>
        </Alert>
      )}

      {paymentConfirmedBanner && enabled && (
        <Alert className="mb-6 border-emerald-200 bg-emerald-50 text-emerald-950">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <strong>Payment confirmed.</strong> Your paid budget should appear on each campaign below. For CPC campaigns, tap{" "}
              <strong>Activate</strong> when you are ready to go live (packs and time boosts may activate automatically).
            </span>
            <Button type="button" variant="outline" size="sm" className="shrink-0 border-emerald-300" onClick={() => setPaymentConfirmedBanner(false)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Ad Performance Dashboard */}
      {enabled && performance && (
        <SectionCard title="Ad performance" className="mb-6">
          <p className="text-sm text-muted-foreground mb-4">
            See how many people your ads reached, how often they were shown, and how many customers took action.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <Eye className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">{formatCompactNumber(performance.impressions)}</p>
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
                      <p className="truncate text-xs text-muted-foreground">
                        {campaign.id}
                      </p>
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
          {enabled && (
            <>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="font-medium text-indigo-950">Choose the ad product that matches your goal</p>
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
                    {defaultModel === "time_based" ? <Badge variant="secondary">Recommended</Badge> : null}
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
                          onClick={async () => {
                            setCreatingPackId(tp.id);
                            try {
                              const targeting = createForm.global_category_ids.length > 0
                                ? { global_category_ids: createForm.global_category_ids }
                                : {};
                              const res = await fetcher.post<{
                                data:
                                  | Campaign
                                  | { campaign: Campaign; requires_payment?: boolean; payment_url?: string | null };
                              }>("/api/provider/ads/campaigns", {
                                time_pack_id: tp.id,
                                targeting,
                              });
                              const payload = res.data as {
                                payment_url?: string | null;
                                requires_payment?: boolean;
                                campaign?: Campaign;
                              };
                              if (payload?.requires_payment && payload?.payment_url) {
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
                          }}
                          disabled={creatingPackId !== null}
                          className="w-full rounded-[14px] bg-background p-4 text-left transition hover:bg-muted/40 disabled:opacity-50 min-h-[148px] flex flex-col"
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                            Time boost
                          </span>
                          <span className="mt-1 text-3xl font-bold tabular-nums text-foreground">{tp.duration_days}</span>
                          <span className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                            {tp.label?.trim()
                              ? tp.label
                              : tp.duration_days === 1
                                ? "day in sponsored slots"
                                : "days in sponsored slots"}
                          </span>
                          <span className="mt-auto pt-3 border-t border-border text-lg font-semibold">{fmt(Number(tp.price_zar))}</span>
                          {creatingPackId === tp.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mt-2 text-emerald-600" />
                          ) : (
                            <span className="text-xs font-semibold text-emerald-600 mt-2">Tap to purchase →</span>
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
                    {defaultModel === "impression_pack" ? <Badge variant="secondary">Recommended</Badge> : null}
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
                        <span className="text-sm text-muted-foreground mt-0.5">sponsored impressions</span>
                        <span className="mt-auto pt-3 border-t border-border text-lg font-semibold">
                          {fmt(Number(pack.price_zar))}
                        </span>
                        {creatingPackId === pack.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mt-2 text-violet-600" />
                        ) : (
                          <span className="text-xs font-semibold text-violet-600 mt-2">Tap to purchase →</span>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mb-4">Optional: select target categories below to show your ad only for those searches. Leave unchecked for all searches.</p>
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
                    {defaultModel === "cpc_budget" ? <Badge variant="secondary">Recommended</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">Open-ended budget and bid per click (for advanced use).</p>
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
                    onChange={(e) => setCreateForm((p) => ({ ...p, daily_budget: e.target.value }))}
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
                    Your ad shows for selected category searches. Leave all unchecked for all searches.
                  </p>
                </div>
                <Button onClick={createDraft} disabled={creating}>
                  {creating ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating…</>
                  ) : (
                    <><Plus className="h-4 w-4 mr-2" /> New campaign (draft)</>
                  )}
                </Button>
              </div>
              )}
            </>
          )}

          {campaigns.length === 0 ? (
            <p className="text-muted-foreground">No campaigns yet. Create a draft to get started.</p>
          ) : (
            <ul className="space-y-3">
              {campaigns.map((c) => {
                const metrics = campaignPerformance[c.id] ?? {
                  impressions: 0,
                  reach: 0,
                  clicks: 0,
                  books: 0,
                  spent: Number(c.spent ?? 0),
                };
                const displayStatus = effectiveCampaignStatus(c, nowMs, metrics);
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
                      : Number(c.budget || 0) > 0 &&
                          Number(c.spent ?? 0) >= Number(c.budget || 0)
                        ? "Budget fully used"
                        : `${fmt(Math.max(0, Number(c.budget || 0) - Number(c.spent || 0)))} budget remaining`;
                return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">Campaign</span>
                      <Badge variant={displayStatus === "active" ? "default" : "secondary"}>
                        {displayStatus}
                      </Badge>
                      <Badge variant="outline">{campaignModelLabel(c)}</Badge>
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
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">{remaining}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(c)}
                      disabled={updating === c.id}
                    >
                      {canEditBudgetFields(c) ? "Edit" : "Edit targeting"}
                    </Button>
                    {(c.status === "draft" || c.status === "paused") && Number(c.budget) > Number(c.spent ?? 0) ? (
                      <Button
                        size="sm"
                        onClick={() => setStatus(c.id, "active")}
                        disabled={updating === c.id}
                      >
                        {updating === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                        Activate
                      </Button>
                    ) : c.status === "draft" || c.status === "paused" ? (
                      <Badge variant="outline">awaiting payment</Badge>
                    ) : displayStatus === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStatus(c.id, "paused")}
                        disabled={updating === c.id}
                      >
                        {updating === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4 mr-1" />}
                        Pause
                      </Button>
                    ) : null}
                    {displayStatus !== "ended" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStatus(c.id, "ended")}
                        disabled={updating === c.id}
                      >
                        End
                      </Button>
                    )}
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
                    You can lower or re-balance this budget. To add more money, buy a new boost or pack.
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
              {updating === editCampaign?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
