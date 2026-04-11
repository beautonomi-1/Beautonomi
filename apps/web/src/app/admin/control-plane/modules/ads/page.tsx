"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft, Package } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

type Pack = { id: string; impressions: number; price_zar: number; display_order: number; is_active: boolean };
type TimePack = { id: string; duration_days: number; label: string; price_zar: number; display_order: number; is_active: boolean };

const MODEL_LABELS: Record<string, string> = {
  cpc_budget: "CPC Budget (pay per impression based on bid)",
  impression_pack: "Impression Packs (fixed impressions at set price)",
  time_based: "Time-Based (fixed daily rate for N days)",
};

export default function AdsModulePage() {
  const { currencyCode } = useReportCurrency();
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [timePacks, setTimePacks] = useState<TimePack[]>([]);
  const [packsSaving, setPacksSaving] = useState(false);
  const [timePacksSaving, setTimePacksSaving] = useState(false);
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
        const [configRes, packsRes, timePacksRes] = await Promise.all([
          fetcher.get<{ data: Record<string, any> | null }>(`/api/admin/control-plane/modules/ads?environment=${env}`),
          fetcher.get<{ data: Pack[] }>("/api/admin/control-plane/modules/ads/packs"),
          fetcher.get<{ data: TimePack[] }>("/api/admin/control-plane/modules/ads/time-packs"),
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
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/control-plane/overview"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Ads Module</h1>
          <p className="text-muted-foreground">Boosted listings / sponsored slots. Model (boost_credits | sponsored_slots), disclosure, max slots.</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Label>Environment</Label>
        <Select value={env} onValueChange={setEnv}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="development">Development</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="production">Production</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Config</CardTitle>
            <CardDescription>Enable paid ads; set model and disclosure. Use feature flags ads.enabled / ads.sponsored_slots.enabled for rollout.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div>
              <Label>Model (e.g. boost_credits, sponsored_slots)</Label>
              <Input value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} placeholder="sponsored_slots" />
            </div>
            <div>
              <Label>Disclosure label</Label>
              <Input value={form.disclosure_label} onChange={(e) => setForm((p) => ({ ...p, disclosure_label: e.target.value }))} placeholder="Sponsored" />
            </div>
            <div>
              <Label>Max sponsored slots</Label>
              <Input type="number" min={0} value={form.max_sponsored_slots} onChange={(e) => setForm((p) => ({ ...p, max_sponsored_slots: e.target.value }))} placeholder="5" />
            </div>
            <div>
              <Label>Cost per impression (ratio of bid)</Label>
              <Input type="number" min={0} max={1} step={0.01} value={form.cost_per_impression_ratio} onChange={(e) => setForm((p) => ({ ...p, cost_per_impression_ratio: e.target.value }))} placeholder="0.05" />
              <p className="text-xs text-muted-foreground mt-1">e.g. 0.05 = 5% of bid_cpc per impression. Leave empty for default 5%.</p>
            </div>

            <div className="border-t pt-4 mt-4">
              <Label className="text-base font-semibold mb-3 block">Available billing models for providers</Label>
              <p className="text-xs text-muted-foreground mb-3">Control which ad billing models providers can use. Disable models you don&apos;t want offered.</p>
              <div className="space-y-2">
                {(["cpc_budget", "impression_pack", "time_based"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2">
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
                    />
                    <span className="text-sm">{MODEL_LABELS[m]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>Default model (shown first to providers)</Label>
              <Select value={form.default_model} onValueChange={(v) => setForm((p) => ({ ...p, default_model: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="time_based">Time-Based (recommended for predictable revenue)</SelectItem>
                  <SelectItem value="impression_pack">Impression Packs</SelectItem>
                  <SelectItem value="cpc_budget">CPC Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Impression packs
            </CardTitle>
            <CardDescription>
              Providers can buy fixed impression amounts (e.g. 50, 100, 500, 1000). Set price ({currencyCode}) and active state.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {packs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No packs. Seed migration adds 50, 100, 500, 1000 by default.</p>
            ) : (
              <div className="space-y-3">
                {packs.map((pack) => (
                  <div key={pack.id} className="flex flex-wrap items-center gap-4 rounded-lg border p-3">
                    <span className="font-medium">{pack.impressions} impressions</span>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Price ({currencyCode})</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="w-24"
                        value={pack.price_zar}
                        onChange={(e) =>
                          setPacks((prev) =>
                            prev.map((p) => (p.id === pack.id ? { ...p, price_zar: parseFloat(e.target.value) || 0 } : p))
                          )
                        }
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={pack.is_active}
                        onCheckedChange={(v) =>
                          setPacks((prev) =>
                            prev.map((p) => (p.id === pack.id ? { ...p, is_active: v } : p))
                          )
                        }
                      />
                      Active
                    </label>
                  </div>
                ))}
                <Button
                  onClick={async () => {
                    setPacksSaving(true);
                    try {
                      const updated = await fetcher.patch<{ data: Pack[] }>("/api/admin/control-plane/modules/ads/packs", {
                        packs: packs.map((p) => ({ id: p.id, price_zar: p.price_zar, is_active: p.is_active })),
                      });
                      setPacks(updated.data ?? []);
                      toast.success("Packs updated");
                    } catch {
                      toast.error("Failed to update packs");
                    } finally {
                      setPacksSaving(false);
                    }
                  }}
                  disabled={packsSaving}
                >
                  {packsSaving ? "Saving…" : "Save packs"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Time-based boost packs
            </CardTitle>
            <CardDescription>
              Providers pay a flat rate for N days of guaranteed sponsored placement. Most predictable revenue model. Set price ({currencyCode}), label, and active state.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {timePacks.length === 0 ? (
              <p className="text-muted-foreground text-sm">No time packs. Run migration 459 to seed defaults (1, 3, 7, 14, 30 days).</p>
            ) : (
              <div className="space-y-3">
                {timePacks.map((tp) => (
                  <div key={tp.id} className="flex flex-wrap items-center gap-4 rounded-lg border p-3">
                    <span className="font-medium">{tp.duration_days} days</span>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Label</Label>
                      <Input
                        className="w-40"
                        value={tp.label}
                        onChange={(e) =>
                          setTimePacks((prev) =>
                            prev.map((p) => (p.id === tp.id ? { ...p, label: e.target.value } : p))
                          )
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Price ({currencyCode})</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="w-24"
                        value={tp.price_zar}
                        onChange={(e) =>
                          setTimePacks((prev) =>
                            prev.map((p) => (p.id === tp.id ? { ...p, price_zar: parseFloat(e.target.value) || 0 } : p))
                          )
                        }
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={tp.is_active}
                        onCheckedChange={(v) =>
                          setTimePacks((prev) =>
                            prev.map((p) => (p.id === tp.id ? { ...p, is_active: v } : p))
                          )
                        }
                      />
                      Active
                    </label>
                  </div>
                ))}
                <Button
                  onClick={async () => {
                    setTimePacksSaving(true);
                    try {
                      const updated = await fetcher.patch<{ data: TimePack[] }>("/api/admin/control-plane/modules/ads/time-packs", {
                        packs: timePacks.map((p) => ({ id: p.id, price_zar: p.price_zar, is_active: p.is_active, label: p.label })),
                      });
                      setTimePacks(updated.data ?? []);
                      toast.success("Time packs updated");
                    } catch {
                      toast.error("Failed to update time packs");
                    } finally {
                      setTimePacksSaving(false);
                    }
                  }}
                  disabled={timePacksSaving}
                >
                  {timePacksSaving ? "Saving…" : "Save time packs"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
    </RoleGuard>
  );
}
