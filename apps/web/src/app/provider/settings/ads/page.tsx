"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  Megaphone,
  Plus,
  Loader2,
  Pause,
  Play,
  MousePointer,
  Eye,
  Banknote,
  ShoppingBag,
} from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  start_at: string | null;
  end_at: string | null;
  targeting?: { global_category_ids?: string[] };
  created_at: string;
};

type GlobalCategory = { id: string; name: string; slug: string };

type PerformanceSummary = {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
};

type ImpressionPack = { id: string; impressions: number; price_zar: number; display_order: number };

export default function ProviderAdsPage() {
  const searchParams = useSearchParams();
  const adsConfig = useModuleConfig("ads") as { enabled?: boolean } | undefined;
  const adsEnabled = useFeatureFlag("ads.enabled");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null);
  const [packs, setPacks] = useState<ImpressionPack[]>([]);
  const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingPackId, setCreatingPackId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
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

  const loadCampaigns = async () => {
    try {
      const res = await fetcher.get<{ data: Campaign[] }>("/api/provider/ads/campaigns");
      setCampaigns(res.data ?? []);
    } catch {
      setCampaigns([]);
    }
  };

  const loadPerformance = async () => {
    try {
      const res = await fetcher.get<{
        data: { summary: PerformanceSummary };
      }>("/api/provider/ads/performance");
      setPerformance(res.data?.summary ?? null);
    } catch {
      setPerformance(null);
    }
  };

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
          fetcher.get<{ data: ImpressionPack[] }>("/api/provider/ads/packs"),
        ]);
        setGlobalCategories(Array.isArray(catRes.data) ? catRes.data : []);
        setPacks(Array.isArray(packsRes.data) ? packsRes.data : []);
      } catch {
        setGlobalCategories([]);
        setPacks([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [enabled]);

  useEffect(() => {
    if (searchParams.get("payment_success") === "1") {
      toast.success("Payment successful. Your campaign budget is now active.");
      loadCampaigns();
      loadPerformance();
      window.history.replaceState({}, "", "/provider/settings/ads");
    }
  }, [searchParams]);

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
    setUpdating(editCampaign.id);
    try {
      await fetcher.patch(`/api/provider/ads/campaigns/${editCampaign.id}`, {
        budget: form.budget ? parseFloat(form.budget) : undefined,
        daily_budget: form.daily_budget === "" ? null : form.daily_budget ? parseFloat(form.daily_budget) : undefined,
        bid_cpc: form.bid_cpc ? parseFloat(form.bid_cpc) : undefined,
        targeting: { global_category_ids: form.global_category_ids },
      });
      await loadCampaigns();
      setEditCampaign(null);
      toast.success("Campaign updated");
    } catch {
      toast.error("Failed to update campaign");
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
    } catch {
      toast.error("Failed to update status");
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
      <SettingsDetailLayout title="Paid ads" description="Boost your visibility with sponsored slots.">
        <LoadingTimeout loadingMessage="Loading..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Growth & Marketing — Paid ads"
      description="Create and manage boosted profile campaigns. Placement in search depends on your bid, profile quality, and relevance to the customer. Set daily or total budget and target specific categories."
    >
      {!enabled && (
        <Alert className="mb-6">
          <AlertDescription>
            Paid ads are not enabled. Contact support or enable the ads module in Control Plane.
          </AlertDescription>
        </Alert>
      )}

      {/* Ad Performance Dashboard */}
      {enabled && performance && (
        <SectionCard title="Ad Performance" className="mb-6">
          <p className="text-sm text-muted-foreground mb-4">
            Track impressions, clicks, spend, and sales generated by your ads.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <Eye className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">{performance.impressions}</p>
                <p className="text-xs text-muted-foreground">Impressions</p>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <MousePointer className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">{performance.clicks}</p>
                <p className="text-xs text-muted-foreground">Clicks</p>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <Banknote className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">ZAR {Number(performance.spend).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Spend</p>
              </div>
            </div>
            <div className="rounded-lg border p-4 flex items-center gap-3">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-semibold">{performance.sales}</p>
                <p className="text-xs text-muted-foreground">Sales (bookings)</p>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Campaigns">
        <div className="space-y-4">
          {enabled && (
            <>
              {packs.length > 0 && (
                <div>
                  <Label className="text-base font-medium">Buy impressions</Label>
                <p className="text-sm text-muted-foreground mb-3">Choose a pack — you pay once and get a fixed number of impressions. Easy to estimate.</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {packs.map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => buyPack(pack)}
                      disabled={creatingPackId !== null}
                      className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 text-left hover:border-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      <p className="font-semibold text-lg">{pack.impressions}</p>
                      <p className="text-sm text-muted-foreground">impressions</p>
                      <p className="font-medium mt-1">ZAR {Number(pack.price_zar).toFixed(2)}</p>
                      {creatingPackId === pack.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mt-2" />
                      ) : (
                        <span className="text-xs text-primary mt-2 inline-block">Buy & pay →</span>
                      )}
                    </button>
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
              )}
              {packs.length > 0 && (
                <div className="border-t pt-4">
                  <Label className="text-base font-medium">Or set a custom budget</Label>
                  <p className="text-sm text-muted-foreground mb-3">Open-ended budget and bid per click (for advanced use).</p>
                </div>
              )}
              <div className="flex flex-wrap items-end gap-3 p-4 border rounded-lg bg-muted/30">
                <div>
                  <Label>Total budget (ZAR)</Label>
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
                  <Label>Daily budget (ZAR, optional)</Label>
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
                  <Label>Bid per click (ZAR)</Label>
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
            </>
          )}

          {campaigns.length === 0 ? (
            <p className="text-muted-foreground">No campaigns yet. Create a draft to get started.</p>
          ) : (
            <ul className="space-y-3">
              {campaigns.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">Campaign</span>
                      <Badge variant={c.status === "active" ? "default" : "secondary"}>
                        {c.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {c.pack_impressions != null
                        ? `${c.pack_impressions} impressions · ZAR ${Number(c.budget).toFixed(2)} paid · ${Number(c.spent).toFixed(2)} spent`
                        : `Total budget ZAR ${Number(c.budget).toFixed(2)} · Spent ZAR ${Number(c.spent).toFixed(2)}${c.daily_budget != null ? ` · Daily cap ZAR ${Number(c.daily_budget).toFixed(2)}` : ""}${c.bid_cpc != null && c.bid_cpc > 0 ? ` · Bid ZAR ${Number(c.bid_cpc).toFixed(2)}/click` : ""}`}
                    </p>
                    {c.targeting?.global_category_ids?.length ? (
                      <p className="text-xs text-muted-foreground">
                        Targeting: {c.targeting.global_category_ids.length} categor
                        {c.targeting.global_category_ids.length === 1 ? "y" : "ies"}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(c)}
                      disabled={updating === c.id}
                    >
                      Edit
                    </Button>
                    {c.status === "draft" || c.status === "paused" ? (
                      <Button
                        size="sm"
                        onClick={() => setStatus(c.id, "active")}
                        disabled={updating === c.id}
                      >
                        {updating === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                        Activate
                      </Button>
                    ) : c.status === "active" ? (
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
                    {c.status !== "ended" && (
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
              ))}
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
              Update budget, daily cap, bid, and targeting. You can pause or turn off the campaign at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Total budget (ZAR)</Label>
              <Input
                type="number"
                min={0}
                value={form.budget}
                onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
              />
            </div>
            <div>
              <Label>Daily budget (ZAR, optional)</Label>
              <Input
                type="number"
                min={0}
                value={form.daily_budget}
                onChange={(e) => setForm((p) => ({ ...p, daily_budget: e.target.value }))}
                placeholder="No daily cap"
              />
            </div>
            <div>
              <Label>Bid per click (ZAR)</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={form.bid_cpc}
                onChange={(e) => setForm((p) => ({ ...p, bid_cpc: e.target.value }))}
              />
            </div>
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
