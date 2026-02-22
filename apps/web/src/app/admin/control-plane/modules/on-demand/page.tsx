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

export default function OnDemandModulePage() {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    ringtone_asset_path: "",
    ring_duration_seconds: 20,
    ring_repeat: true,
    waiting_screen_timeout_seconds: 45,
    provider_accept_window_seconds: 30,
    ui_copy: "{}",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: Record<string, unknown> | null }>(`/api/admin/control-plane/modules/on-demand?environment=${env}`);
        const d = res.data;
        if (d) {
          setForm({
            enabled: Boolean(d.enabled),
            ringtone_asset_path: String(d.ringtone_asset_path ?? ""),
            ring_duration_seconds: Number(d.ring_duration_seconds ?? 20),
            ring_repeat: Boolean(d.ring_repeat ?? true),
            waiting_screen_timeout_seconds: Number(d.waiting_screen_timeout_seconds ?? 45),
            provider_accept_window_seconds: Number(d.provider_accept_window_seconds ?? 30),
            ui_copy: typeof d.ui_copy === "string" ? d.ui_copy : JSON.stringify(d.ui_copy ?? {}, null, 2),
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
      let uiCopy: Record<string, unknown> = {};
      try {
        uiCopy = JSON.parse(form.ui_copy || "{}");
      } catch {
        toast.error("Invalid JSON in UI copy");
        setSaving(false);
        return;
      }
      await fetcher.put("/api/admin/control-plane/modules/on-demand", {
        environment: env,
        enabled: form.enabled,
        ringtone_asset_path: form.ringtone_asset_path || null,
        ring_duration_seconds: form.ring_duration_seconds,
        ring_repeat: form.ring_repeat,
        waiting_screen_timeout_seconds: form.waiting_screen_timeout_seconds,
        provider_accept_window_seconds: form.provider_accept_window_seconds,
        ui_copy: uiCopy,
      });
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/control-plane/overview"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">On-Demand UX</h1>
          <p className="text-muted-foreground">Ringtone path, durations, waiting screen, UI copy. Toggle via feature flag.</p>
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
            <CardDescription>Storage path for ringtone: app-assets bucket, ux/ringtones/&lt;env&gt;/default.mp3</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div>
              <Label>Ringtone asset path</Label>
              <Input
                value={form.ringtone_asset_path}
                onChange={(e) => setForm((p) => ({ ...p, ringtone_asset_path: e.target.value }))}
                placeholder="ux/ringtones/production/default.mp3"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Ring duration (seconds)</Label>
                <Input type="number" value={form.ring_duration_seconds} onChange={(e) => setForm((p) => ({ ...p, ring_duration_seconds: parseInt(e.target.value, 10) || 20 }))} />
              </div>
              <div>
                <Label>Waiting screen timeout (seconds)</Label>
                <Input type="number" value={form.waiting_screen_timeout_seconds} onChange={(e) => setForm((p) => ({ ...p, waiting_screen_timeout_seconds: parseInt(e.target.value, 10) || 45 }))} />
              </div>
              <div>
                <Label>Provider accept window (seconds)</Label>
                <Input type="number" value={form.provider_accept_window_seconds} onChange={(e) => setForm((p) => ({ ...p, provider_accept_window_seconds: parseInt(e.target.value, 10) || 30 }))} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.ring_repeat} onCheckedChange={(v) => setForm((p) => ({ ...p, ring_repeat: v }))} />
                <Label>Ring repeat</Label>
              </div>
            </div>
            <div>
              <Label>UI copy (JSON)</Label>
              <textarea
                className="w-full min-h-[120px] rounded border p-2 font-mono text-sm"
                value={form.ui_copy}
                onChange={(e) => setForm((p) => ({ ...p, ui_copy: e.target.value }))}
              />
            </div>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
