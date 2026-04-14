"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft, Package, Clock, Eye, MousePointer, ShoppingBag, DollarSign, Megaphone, ExternalLink, Save, Zap, Info } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

type Pack = { id: string; impressions: number; price_zar: number; display_order: number; is_active: boolean };
type TimePack = { id: string; duration_days: number; label: string; price_zar: number; display_order: number; is_active: boolean };
type Overview = {
  campaigns_by_status: Record<string, number>;
  events_7d: { impressions: number; clicks: number; books: number };
  events_30d: { impressions: number; clicks: number; books: number };
  prepaid_revenue_30d_zar: number;
  total_spent_in_campaigns_zar: number;
  total_budget_in_campaigns_zar: number;
};

const MODEL_LABELS: Record<string, string> = {
  cpc_budget: "CPC Budget",
  impression_pack: "Impression Packs",
  time_based: "Time-Based Boosts",
};

const MODEL_DESCRIPTIONS: Record<string, string> = {
  cpc_budget: "Pay per impression based on bid amount",
  impression_pack: "Buy fixed impressions at a set price",
  time_based: "Fixed daily rate for N days of guaranteed placement",
};

export default function AdsModulePage() {
  const { currencyCode, format: fmt } = useReportCurrency();
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [timePacks, setTimePacks] = useState<TimePack[]>([]);
  const [packsSaving, setPacksSaving] = useState(false);
  const [timePacksSaving, setTimePacksSaving] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    model: "",
    disclosure_label: "",
    max_sponsored_slots: "",
    cost_per_impression_ratio: "",
    available_models: ["cpc_budget", "impression_pack", "time_based"] as string[],
    default_model: "time_based",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [configRes, packsRes, timePacksRes, overviewRes] = await Promise.all([
          fetcher.get<{ data: Record<string, any> | null }>(`/api/admin/control-plane/modules/ads?environment=${env}`),
          fetcher.get<{ data: Pack[] }>("/api/admin/control-plane/modules/ads/packs"),
          fetcher.get<{ data: TimePack[] }>("/api/admin/control-plane/modules/ads/time-packs"),
          fetcher.get<{ data: Overview }>("/api/admin/ads/overview").catch(() => ({ data: null })),
        ]);
        const d = configRes.data;
        if (d) {
          setForm({
            enabled: Boolean(d.enabled),
            model: String(d.model ?? ""),
            disclosure_label: String(d.disclosure_label ?? ""),
            max_sponsored_slots: d.max_sponsored_slots != null ? String(d.max_sponsored_slots) : "",
            cost_per_impression_ratio: d.cost_per_impression_ratio != null ? String(d.cost_per_impression_ratio) : "",
            available_models: Array.isArray(d.available_models) ? d.available_models : ["cpc_budget", "impression_pack", "time_based"],
            default_model: String(d.default_model ?? "time_based"),
          });
        }
        setPacks(Array.isArray(packsRes.data) ? packsRes.data : []);
        setTimePacks(Array.isArray(timePacksRes.data) ? timePacksRes.data : []);
        setOverview(overviewRes.data ?? null);
      } catch {
        toast.error("Failed to load config");
      } finally {
        setLoading(false);
      }
    })();
  }, [env]);

  const save = async () => {
    setSaving(true);
    try {
      await fetcher.put("/api/admin/control-plane/modules/ads", {
        environment: env,
        enabled: form.enabled,
        model: form.model || null,
        disclosure_label: form.disclosure_label || null,
        max_sponsored_slots: form.max_sponsored_slots ? parseInt(form.max_sponsored_slots, 10) : null,
        cost_per_impression_ratio: form.cost_per_impression_ratio ? parseFloat(form.cost_per_impression_ratio) : null,
        available_models: form.available_models,
        default_model: form.default_model,
      });
      toast.success("Config saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const savePacks = async () => {
    setPacksSaving(true);
    try {
      const updated = await fetcher.patch<{ data: Pack[] }>("/api/admin/control-plane/modules/ads/packs", {
        packs: packs.map((p) => ({ id: p.id, price_zar: p.price_zar, is_active: p.is_active })),
      });
      setPacks(updated.data ?? []);
      toast.success("Impression packs saved");
    } catch {
      toast.error("Failed to save packs");
    } finally {
      setPacksSaving(false);
    }
  };

  const saveTimePacks = async () => {
    setTimePacksSaving(true);
    try {
      const updated = await fetcher.patch<{ data: TimePack[] }>("/api/admin/control-plane/modules/ads/time-packs", {
        packs: timePacks.map((p) => ({ id: p.id, price_zar: p.price_zar, is_active: p.is_active, label: p.label })),
      });
      setTimePacks(updated.data ?? []);
      toast.success("Time packs saved");
    } catch {
      toast.error("Failed to save time packs");
    } finally {
      setTimePacksSaving(false);
    }
  };

  const totalCampaigns = overview ? Object.values(overview.campaigns_by_status).reduce((s, c) => s + c, 0) : 0;

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/control-plane/overview">
            <Button variant="ghost" size="icon" className="shrink-0"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Ads Module</h1>
            <p className="text-sm text-muted-foreground">Configure sponsored listings, impression packs, and time-based boosts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/ads">
            <Button variant="outline" size="sm">
              <Megaphone className="h-4 w-4 mr-1.5" />
              View Campaigns
              <ExternalLink className="h-3 w-3 ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Megaphone className="h-3.5 w-3.5" />
              <span className="text-xs">Campaigns</span>
            </div>
            <p className="text-xl font-bold">{totalCampaigns}</p>
            <p className="text-[10px] text-muted-foreground">
              {overview.campaigns_by_status.active ?? 0} active
              {(overview.campaigns_by_status.paused ?? 0) > 0 && ` · ${overview.campaigns_by_status.paused} paused`}
            </p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Eye className="h-3.5 w-3.5" />
              <span className="text-xs">Events (30d)</span>
            </div>
            <p className="text-xl font-bold">{overview.events_30d.impressions.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">
              {overview.events_30d.clicks} clicks · {overview.events_30d.books} bookings
            </p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              <span className="text-xs">Revenue (30d)</span>
            </div>
            <p className="text-xl font-bold">{fmt(overview.prepaid_revenue_30d_zar)}</p>
            <p className="text-[10px] text-muted-foreground">prepaid orders</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Zap className="h-3.5 w-3.5" />
              <span className="text-xs">Budget usage</span>
            </div>
            <p className="text-xl font-bold">{fmt(overview.total_spent_in_campaigns_zar)}</p>
            <p className="text-[10px] text-muted-foreground">of {fmt(overview.total_budget_in_campaigns_zar)} total</p>
          </div>
        </div>
      )}

      {/* Environment + Status */}
      <div className="flex flex-wrap items-center gap-4 bg-white border rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Environment</Label>
          <Select value={env} onValueChange={setEnv}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={form.enabled ? "default" : "secondary"} className={form.enabled ? "bg-green-100 text-green-700" : ""}>
            {form.enabled ? "Ads Enabled" : "Ads Disabled"}
          </Badge>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading configuration...</div>
      ) : (
        <>
          {/* Module Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Module Configuration</CardTitle>
              <CardDescription>Core settings for the ads system. Changes apply to the selected environment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <Label className="font-medium">Enable Ads Module</Label>
                  <p className="text-xs text-muted-foreground">Turn sponsored listings on or off</p>
                </div>
                <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Disclosure Label</Label>
                  <Input value={form.disclosure_label} onChange={(e) => setForm((p) => ({ ...p, disclosure_label: e.target.value }))} placeholder="Sponsored" />
                  <p className="text-[11px] text-muted-foreground">Text shown on sponsored listings (e.g. "Sponsored", "Ad")</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Max Sponsored Slots</Label>
                  <Input type="number" min={0} value={form.max_sponsored_slots} onChange={(e) => setForm((p) => ({ ...p, max_sponsored_slots: e.target.value }))} placeholder="5" />
                  <p className="text-[11px] text-muted-foreground">Maximum sponsored results shown per search page</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Cost Per Impression Ratio</Label>
                <Input type="number" min={0} max={1} step={0.01} className="w-40" value={form.cost_per_impression_ratio} onChange={(e) => setForm((p) => ({ ...p, cost_per_impression_ratio: e.target.value }))} placeholder="0.05" />
                <p className="text-[11px] text-muted-foreground">Fraction of bid_cpc charged per impression (0.05 = 5%). Only applies to CPC model.</p>
              </div>

              <div className="border-t pt-5 space-y-4">
                <div>
                  <Label className="text-base font-semibold">Billing Models</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Choose which billing models are available to providers</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(["cpc_budget", "impression_pack", "time_based"] as const).map((m) => (
                    <div
                      key={m}
                      className={`relative rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                        form.available_models.includes(m) ? "border-blue-200 bg-blue-50/50" : "border-zinc-200 bg-zinc-50/50 opacity-60"
                      }`}
                      onClick={() => {
                        setForm((p) => ({
                          ...p,
                          available_models: p.available_models.includes(m)
                            ? p.available_models.filter((x) => x !== m)
                            : [...p.available_models, m],
                        }));
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-sm font-medium">{MODEL_LABELS[m]}</span>
                        <Switch
                          checked={form.available_models.includes(m)}
                          onCheckedChange={(v) => {
                            setForm((p) => ({
                              ...p,
                              available_models: v
                                ? [...p.available_models, m]
                                : p.available_models.filter((x) => x !== m),
                            }));
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{MODEL_DESCRIPTIONS[m]}</p>
                      {form.default_model === m && (
                        <Badge variant="secondary" className="mt-2 text-[10px]">Default</Badge>
                      )}
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label>Default Model</Label>
                  <Select value={form.default_model} onValueChange={(v) => setForm((p) => ({ ...p, default_model: v }))}>
                    <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time_based">Time-Based (predictable revenue)</SelectItem>
                      <SelectItem value="impression_pack">Impression Packs</SelectItem>
                      <SelectItem value="cpc_budget">CPC Budget</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Shown first when providers create a campaign</p>
                </div>
              </div>

              <div className="border-t pt-4 flex justify-end">
                <Button onClick={save} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Config"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Impression Packs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Package className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Impression Packs</CardTitle>
                    <CardDescription>Fixed impression amounts at set prices ({currencyCode})</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {packs.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Info className="h-5 w-5 mx-auto mb-2" />
                  No impression packs configured. Run the seed migration to create defaults.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {packs.map((pack) => (
                      <div key={pack.id} className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${pack.is_active ? "bg-white" : "bg-zinc-50 opacity-60"}`}>
                        <div>
                          <p className="font-semibold text-sm">{pack.impressions.toLocaleString()} impressions</p>
                          <p className="text-xs text-muted-foreground">
                            {pack.price_zar > 0 ? `${(pack.price_zar / pack.impressions * 100).toFixed(1)} cents/impression` : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{currencyCode}</span>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="w-20 text-right"
                              value={pack.price_zar}
                              onChange={(e) =>
                                setPacks((prev) =>
                                  prev.map((p) => (p.id === pack.id ? { ...p, price_zar: parseFloat(e.target.value) || 0 } : p))
                                )
                              }
                            />
                          </div>
                          <Switch
                            checked={pack.is_active}
                            onCheckedChange={(v) =>
                              setPacks((prev) =>
                                prev.map((p) => (p.id === pack.id ? { ...p, is_active: v } : p))
                              )
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={savePacks} disabled={packsSaving} variant="outline" className="gap-2">
                      <Save className="h-4 w-4" />
                      {packsSaving ? "Saving..." : "Save Packs"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Time Packs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Time-Based Boost Packs</CardTitle>
                    <CardDescription>Guaranteed sponsored placement for N days at a flat rate ({currencyCode})</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {timePacks.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Info className="h-5 w-5 mx-auto mb-2" />
                  No time packs configured. Run migration 459 to seed defaults.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {timePacks.map((tp) => (
                      <div key={tp.id} className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${tp.is_active ? "bg-white" : "bg-zinc-50 opacity-60"}`}>
                        <div>
                          <p className="font-semibold text-sm">{tp.duration_days} day{tp.duration_days !== 1 ? "s" : ""}</p>
                          <Input
                            className="mt-1 w-36 h-7 text-xs"
                            value={tp.label}
                            placeholder="Pack label..."
                            onChange={(e) =>
                              setTimePacks((prev) =>
                                prev.map((p) => (p.id === tp.id ? { ...p, label: e.target.value } : p))
                              )
                            }
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{currencyCode}</span>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="w-20 text-right"
                              value={tp.price_zar}
                              onChange={(e) =>
                                setTimePacks((prev) =>
                                  prev.map((p) => (p.id === tp.id ? { ...p, price_zar: parseFloat(e.target.value) || 0 } : p))
                                )
                              }
                            />
                          </div>
                          <Switch
                            checked={tp.is_active}
                            onCheckedChange={(v) =>
                              setTimePacks((prev) =>
                                prev.map((p) => (p.id === tp.id ? { ...p, is_active: v } : p))
                              )
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveTimePacks} disabled={timePacksSaving} variant="outline" className="gap-2">
                      <Save className="h-4 w-4" />
                      {timePacksSaving ? "Saving..." : "Save Time Packs"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
    </RoleGuard>
  );
}
