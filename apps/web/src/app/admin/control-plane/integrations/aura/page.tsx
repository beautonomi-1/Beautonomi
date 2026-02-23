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

export default function AuraIntegrationPage() {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    org_id: "",
    api_key_secret: "",
  });
  const [apiKeySet, setApiKeySet] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: Record<string, unknown> | null }>(`/api/admin/control-plane/integrations/aura?environment=${env}`);
        const d = res.data;
        if (d) {
          setForm((p) => ({
            ...p,
            enabled: Boolean(d.enabled),
            org_id: String(d.org_id ?? ""),
          }));
          setApiKeySet(Boolean((d as { api_key_set?: boolean }).api_key_set));
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
      await fetcher.put("/api/admin/control-plane/integrations/aura", {
        environment: env,
        enabled: form.enabled,
        org_id: form.org_id || null,
        ...(form.api_key_secret ? { api_key_secret: form.api_key_secret } : {}),
      });
      setForm((p) => ({ ...p, api_key_secret: "" }));
      if (form.api_key_secret) setApiKeySet(true);
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
        <Link href="/admin/control-plane/integrations"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Aura</h1>
          <p className="text-muted-foreground">Identity/trust & safety (panic, check-in, escalation). API key and org ID. Never shown after save.</p>
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
            <CardDescription>API key is never returned. Leave blank to keep existing key.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div>
              <Label>Org ID</Label>
              <Input value={form.org_id} onChange={(e) => setForm((p) => ({ ...p, org_id: e.target.value }))} placeholder="aura-org-id" />
            </div>
            <div>
              <Label>API key (leave blank to keep)</Label>
              <Input type="password" placeholder={apiKeySet ? "••••••••" : "Enter Aura API key"} value={form.api_key_secret} onChange={(e) => setForm((p) => ({ ...p, api_key_secret: e.target.value }))} />
            </div>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </CardContent>
        </Card>
      )}
    </div>
    </RoleGuard>
  );
}
