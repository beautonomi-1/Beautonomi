"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";

interface EntitlementRow {
  id: string;
  plan_id: string;
  feature_key: string;
  enabled: boolean;
  calls_per_day: number;
  max_tokens: number;
  model_tier: string;
  updated_at: string;
}

export default function AiEntitlementsPage() {
  const [items, setItems] = useState<EntitlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [planIdFilter, setPlanIdFilter] = useState("");
  const [form, setForm] = useState({
    plan_id: "",
    feature_key: "",
    enabled: true,
    calls_per_day: 0,
    max_tokens: 600,
    model_tier: "cheap",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const url = planIdFilter
        ? `/api/admin/control-plane/modules/ai/entitlements?plan_id=${encodeURIComponent(planIdFilter)}`
        : "/api/admin/control-plane/modules/ai/entitlements";
      const res = await fetcher.get<{ data: EntitlementRow[] }>(url);
      setItems(res.data ?? []);
    } catch {
      toast.error("Failed to load entitlements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [planIdFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filter changes

  const save = async () => {
    if (!form.plan_id || !form.feature_key) {
      toast.error("Plan ID and feature key required");
      return;
    }
    setSaving(true);
    try {
      await fetcher.post("/api/admin/control-plane/modules/ai/entitlements", form);
      toast.success("Saved");
      setForm((p) => ({ ...p, feature_key: "" }));
      load();
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
        <Link href="/admin/control-plane/modules/ai">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">AI Plan Entitlements</h1>
          <p className="text-muted-foreground">Per-plan AI feature access: enabled, calls_per_day, max_tokens, model_tier.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add / update entitlement</CardTitle>
          <CardDescription>Upsert by plan_id + feature_key.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Plan ID (UUID)</Label>
              <Input value={form.plan_id} onChange={(e) => setForm((p) => ({ ...p, plan_id: e.target.value }))} placeholder="UUID" />
            </div>
            <div>
              <Label>Feature key</Label>
              <Input value={form.feature_key} onChange={(e) => setForm((p) => ({ ...p, feature_key: e.target.value }))} placeholder="ai.provider.profile_completion" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div>
              <Label>Calls per day</Label>
              <Input type="number" value={form.calls_per_day} onChange={(e) => setForm((p) => ({ ...p, calls_per_day: parseInt(e.target.value, 10) || 0 }))} />
            </div>
            <div>
              <Label>Max tokens</Label>
              <Input type="number" value={form.max_tokens} onChange={(e) => setForm((p) => ({ ...p, max_tokens: parseInt(e.target.value, 10) || 600 }))} />
            </div>
            <div>
              <Label>Model tier</Label>
              <Input value={form.model_tier} onChange={(e) => setForm((p) => ({ ...p, model_tier: e.target.value }))} />
            </div>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </CardContent>
      </Card>

      <div>
        <Label>Filter by plan ID</Label>
        <Input
          placeholder="UUID"
          value={planIdFilter}
          onChange={(e) => setPlanIdFilter(e.target.value)}
          className="w-64 mt-1"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entitlements</CardTitle>
          <CardDescription>Total: {items.length}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">None. Add above.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((e) => (
                <li key={e.id} className="flex items-center gap-2 border rounded p-2">
                  <span className="font-mono text-sm">{e.plan_id.slice(0, 8)}…</span>
                  <span className="font-medium">{e.feature_key}</span>
                  <span className="text-sm">{e.enabled ? "on" : "off"}</span>
                  <span className="text-sm text-muted-foreground">{e.calls_per_day}/day · {e.max_tokens} tok · {e.model_tier}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
    </RoleGuard>
  );
}
