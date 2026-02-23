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

export default function DistanceModulePage() {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    default_radius_km: "",
    max_radius_km: "",
    step_km: "",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: Record<string, unknown> | null }>(`/api/admin/control-plane/modules/distance?environment=${env}`);
        const d = res.data;
        if (d) {
          setForm({
            enabled: Boolean(d.enabled),
            default_radius_km: d.default_radius_km != null ? String(d.default_radius_km) : "",
            max_radius_km: d.max_radius_km != null ? String(d.max_radius_km) : "",
            step_km: d.step_km != null ? String(d.step_km) : "",
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
      await fetcher.put("/api/admin/control-plane/modules/distance", {
        environment: env,
        enabled: form.enabled,
        default_radius_km: form.default_radius_km ? parseFloat(form.default_radius_km) : null,
        max_radius_km: form.max_radius_km ? parseFloat(form.max_radius_km) : null,
        step_km: form.step_km ? parseFloat(form.step_km) : null,
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
          <h1 className="text-2xl font-bold">Distance Module</h1>
          <p className="text-muted-foreground">Tinder-style radius for house calls. Default/max radius, step. Use feature flags distance.enabled, distance.filter.enabled.</p>
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
            <CardDescription>Radius in km for search filter and provider service area. Travel fee rules are in platform_settings / provider_travel_fee_settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div>
              <Label>Default radius (km)</Label>
              <Input type="number" min={0} step={0.5} value={form.default_radius_km} onChange={(e) => setForm((p) => ({ ...p, default_radius_km: e.target.value }))} placeholder="10" />
            </div>
            <div>
              <Label>Max radius (km)</Label>
              <Input type="number" min={0} step={0.5} value={form.max_radius_km} onChange={(e) => setForm((p) => ({ ...p, max_radius_km: e.target.value }))} placeholder="50" />
            </div>
            <div>
              <Label>Step (km)</Label>
              <Input type="number" min={0} step={0.5} value={form.step_km} onChange={(e) => setForm((p) => ({ ...p, step_km: e.target.value }))} placeholder="5" />
            </div>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </CardContent>
        </Card>
      )}
    </div>
    </RoleGuard>
  );
}
