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

export default function AdsModulePage() {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    model: "",
    disclosure_label: "",
    max_sponsored_slots: "",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: Record<string, unknown> | null }>(`/api/admin/control-plane/modules/ads?environment=${env}`);
        const d = res.data;
        if (d) {
          setForm({
            enabled: Boolean(d.enabled),
            model: String(d.model ?? ""),
            disclosure_label: String(d.disclosure_label ?? ""),
            max_sponsored_slots: d.max_sponsored_slots != null ? String(d.max_sponsored_slots) : "",
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
      await fetcher.put("/api/admin/control-plane/modules/ads", {
        environment: env,
        enabled: form.enabled,
        model: form.model || null,
        disclosure_label: form.disclosure_label || null,
        max_sponsored_slots: form.max_sponsored_slots ? parseInt(form.max_sponsored_slots, 10) : null,
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
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </CardContent>
        </Card>
      )}
    </div>
    </RoleGuard>
  );
}
