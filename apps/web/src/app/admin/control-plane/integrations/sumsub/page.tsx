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

export default function SumsubIntegrationPage() {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    level_name: "",
    app_token_secret: "",
    secret_key_secret: "",
    webhook_secret_secret: "",
  });
  const [secretsSet, setSecretsSet] = useState({ app_token: false, secret_key: false, webhook: false });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: Record<string, unknown> | null }>(`/api/admin/control-plane/integrations/sumsub?environment=${env}`);
        const d = res.data;
        if (d) {
          setForm((p) => ({
            ...p,
            enabled: Boolean(d.enabled),
            level_name: String(d.level_name ?? ""),
          }));
          setSecretsSet({
            app_token: Boolean((d as { app_token_set?: boolean }).app_token_set),
            secret_key: Boolean((d as { secret_key_set?: boolean }).secret_key_set),
            webhook: Boolean((d as { webhook_secret_set?: boolean }).webhook_secret_set),
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
      await fetcher.put("/api/admin/control-plane/integrations/sumsub", {
        environment: env,
        enabled: form.enabled,
        level_name: form.level_name || null,
        ...(form.app_token_secret ? { app_token_secret: form.app_token_secret } : {}),
        ...(form.secret_key_secret ? { secret_key_secret: form.secret_key_secret } : {}),
        ...(form.webhook_secret_secret ? { webhook_secret_secret: form.webhook_secret_secret } : {}),
      });
      setForm((p) => ({ ...p, app_token_secret: "", secret_key_secret: "", webhook_secret_secret: "" }));
      if (form.app_token_secret) setSecretsSet((s) => ({ ...s, app_token: true }));
      if (form.secret_key_secret) setSecretsSet((s) => ({ ...s, secret_key: true }));
      if (form.webhook_secret_secret) setSecretsSet((s) => ({ ...s, webhook: true }));
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
          <h1 className="text-2xl font-bold">Sumsub</h1>
          <p className="text-muted-foreground">KYC verification (SDK). App token, secret key, webhook secret. Never shown after save.</p>
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
            <CardDescription>Secrets are never returned. Leave blank to keep existing values.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div>
              <Label>Level name</Label>
              <Input value={form.level_name} onChange={(e) => setForm((p) => ({ ...p, level_name: e.target.value }))} placeholder="basic-kyc-level" />
            </div>
            <div>
              <Label>App token (leave blank to keep)</Label>
              <Input type="password" placeholder={secretsSet.app_token ? "••••••••" : "Enter app token"} value={form.app_token_secret} onChange={(e) => setForm((p) => ({ ...p, app_token_secret: e.target.value }))} />
            </div>
            <div>
              <Label>Secret key (leave blank to keep)</Label>
              <Input type="password" placeholder={secretsSet.secret_key ? "••••••••" : "Enter secret key"} value={form.secret_key_secret} onChange={(e) => setForm((p) => ({ ...p, secret_key_secret: e.target.value }))} />
            </div>
            <div>
              <Label>Webhook secret (leave blank to keep)</Label>
              <Input type="password" placeholder={secretsSet.webhook ? "••••••••" : "Enter webhook secret"} value={form.webhook_secret_secret} onChange={(e) => setForm((p) => ({ ...p, webhook_secret_secret: e.target.value }))} />
            </div>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </CardContent>
        </Card>
      )}
    </div>
    </RoleGuard>
  );
}
