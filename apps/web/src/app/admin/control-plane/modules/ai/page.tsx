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
import { ArrowLeft } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";

export default function AiModulePage() {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    sampling_rate: 0,
    cache_ttl_seconds: 86400,
    default_model_tier: "cheap",
    max_tokens: 600,
    temperature: 0.3,
    daily_budget_credits: 0,
    per_provider_calls_per_day: 0,
    per_user_calls_per_day: 0,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: Record<string, unknown> | null }>(`/api/admin/control-plane/modules/ai?environment=${env}`);
        const d = res.data;
        if (d) {
          setForm({
            enabled: Boolean(d.enabled),
            sampling_rate: Number(d.sampling_rate ?? 0),
            cache_ttl_seconds: Number(d.cache_ttl_seconds ?? 86400),
            default_model_tier: String(d.default_model_tier ?? "cheap"),
            max_tokens: Number(d.max_tokens ?? 600),
            temperature: Number(d.temperature ?? 0.3),
            daily_budget_credits: Number(d.daily_budget_credits ?? 0),
            per_provider_calls_per_day: Number(d.per_provider_calls_per_day ?? 0),
            per_user_calls_per_day: Number(d.per_user_calls_per_day ?? 0),
          });
        }
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
      await fetcher.put("/api/admin/control-plane/modules/ai", { environment: env, ...form });
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
          <h1 className="text-2xl font-bold">AI Module</h1>
          <p className="text-muted-foreground">Budgets, limits, cache TTL.</p>
          <div className="flex gap-2 mt-2">
            <Link href="/admin/control-plane/modules/ai/templates"><Button variant="link" className="p-0 h-auto">Templates</Button></Link>
            <Link href="/admin/control-plane/modules/ai/usage"><Button variant="link" className="p-0 h-auto">Usage</Button></Link>
            <Link href="/admin/control-plane/modules/ai/entitlements"><Button variant="link" className="p-0 h-auto">Entitlements</Button></Link>
          </div>
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
            <CardDescription>Global AI limits and defaults. Per-plan entitlements: AI entitlements page (Phase 4).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Sampling rate (0–100)</Label>
                <Input type="number" value={form.sampling_rate} onChange={(e) => setForm((p) => ({ ...p, sampling_rate: parseInt(e.target.value, 10) || 0 }))} />
              </div>
              <div>
                <Label>Cache TTL (seconds)</Label>
                <Input type="number" value={form.cache_ttl_seconds} onChange={(e) => setForm((p) => ({ ...p, cache_ttl_seconds: parseInt(e.target.value, 10) || 86400 }))} />
              </div>
              <div>
                <Label>Default model tier</Label>
                <Input value={form.default_model_tier} onChange={(e) => setForm((p) => ({ ...p, default_model_tier: e.target.value }))} />
              </div>
              <div>
                <Label>Max tokens</Label>
                <Input type="number" value={form.max_tokens} onChange={(e) => setForm((p) => ({ ...p, max_tokens: parseInt(e.target.value, 10) || 600 }))} />
              </div>
              <div>
                <Label>Temperature</Label>
                <Input type="number" step="0.1" value={form.temperature} onChange={(e) => setForm((p) => ({ ...p, temperature: parseFloat(e.target.value) || 0.3 }))} />
              </div>
              <div>
                <Label>Daily budget credits</Label>
                <Input type="number" value={form.daily_budget_credits} onChange={(e) => setForm((p) => ({ ...p, daily_budget_credits: parseInt(e.target.value, 10) || 0 }))} />
              </div>
              <div>
                <Label>Per-provider calls/day</Label>
                <Input type="number" value={form.per_provider_calls_per_day} onChange={(e) => setForm((p) => ({ ...p, per_provider_calls_per_day: parseInt(e.target.value, 10) || 0 }))} />
              </div>
              <div>
                <Label>Per-user calls/day</Label>
                <Input type="number" value={form.per_user_calls_per_day} onChange={(e) => setForm((p) => ({ ...p, per_user_calls_per_day: parseInt(e.target.value, 10) || 0 }))} />
              </div>
            </div>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </CardContent>
        </Card>
      )}
    </div>
    </RoleGuard>
  );
}
