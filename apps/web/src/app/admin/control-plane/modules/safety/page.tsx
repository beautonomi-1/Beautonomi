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

export default function SafetyModulePage() {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    check_in_enabled: true,
    escalation_enabled: true,
    cooldown_seconds: 300,
    ui_copy: "{}",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: Record<string, unknown> | null }>(`/api/admin/control-plane/modules/safety?environment=${env}`);
        const d = res.data;
        if (d) {
          setForm({
            enabled: Boolean(d.enabled),
            check_in_enabled: Boolean(d.check_in_enabled ?? true),
            escalation_enabled: Boolean(d.escalation_enabled ?? true),
            cooldown_seconds: Number(d.cooldown_seconds ?? 300),
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
      await fetcher.put("/api/admin/control-plane/modules/safety", {
        environment: env,
        enabled: form.enabled,
        check_in_enabled: form.check_in_enabled,
        escalation_enabled: form.escalation_enabled,
        cooldown_seconds: form.cooldown_seconds,
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
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/control-plane/overview"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Safety Module</h1>
          <p className="text-muted-foreground">Panic / assist / check-in via Aura. Enable check-in and escalation; set cooldown and UI copy.</p>
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
            <CardDescription>Requires Aura integration enabled for escalation. Use feature flags safety.enabled, safety.panic.enabled, safety.check_in.enabled.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.check_in_enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, check_in_enabled: v }))} />
              <Label>Check-in enabled</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.escalation_enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, escalation_enabled: v }))} />
              <Label>Escalation enabled (Aura)</Label>
            </div>
            <div>
              <Label>Cooldown (seconds)</Label>
              <Input type="number" min={0} value={form.cooldown_seconds} onChange={(e) => setForm((p) => ({ ...p, cooldown_seconds: parseInt(e.target.value, 10) || 0 }))} />
            </div>
            <div>
              <Label>UI copy (JSON)</Label>
              <textarea className="w-full min-h-[80px] rounded border p-2 font-mono text-sm" value={form.ui_copy} onChange={(e) => setForm((p) => ({ ...p, ui_copy: e.target.value }))} />
            </div>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </CardContent>
        </Card>
      )}
    </div>
    </RoleGuard>
  );
}
