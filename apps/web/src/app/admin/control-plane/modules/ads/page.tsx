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

type Pack = { id: string; impressions: number; price_zar: number; display_order: number; is_active: boolean };

export default function AdsModulePage() {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packsSaving, setPacksSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    model: "",
    disclosure_label: "",
    max_sponsored_slots: "",
    cost_per_impression_ratio: "",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [configRes, packsRes] = await Promise.all([
          fetcher.get<{ data: Record<string, unknown> | null }>(`/api/admin/control-plane/modules/ads?environment=${env}`),
          fetcher.get<{ data: Pack[] }>("/api/admin/control-plane/modules/ads/packs"),
        ]);
        const d = configRes.data;
        if (d) {
          setForm({
            enabled: Boolean(d.enabled),
            model: String(d.model ?? ""),
            disclosure_label: String(d.disclosure_label ?? ""),
            max_sponsored_slots: d.max_sponsored_slots != null ? String(d.max_sponsored_slots) : "",
            cost_per_impression_ratio: d.cost_per_impression_ratio != null ? String(d.cost_per_impression_ratio) : "",
          });
        }
        setPacks(Array.isArray(packsRes.data) ? packsRes.data : []);
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
              Providers can buy fixed impression amounts (e.g. 50, 100, 500, 1000). Set price (ZAR) and active state.
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
                      <Label className="text-xs">Price (ZAR)</Label>
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
    </div>
    </RoleGuard>
  );
}
