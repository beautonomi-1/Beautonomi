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

export default function GeminiIntegrationPage() {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    api_key_secret: "",
    default_model: "gemini-1.5-flash",
    allowed_models: "[\"gemini-1.5-flash\",\"gemini-1.5-pro\"]",
    safety_settings: "{}",
  });
  const [apiKeySet, setApiKeySet] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: Record<string, unknown> | null }>(`/api/admin/control-plane/integrations/gemini?environment=${env}`);
        const d = res.data;
        if (d) {
          setForm((p) => ({
            ...p,
            enabled: Boolean(d.enabled),
            default_model: String(d.default_model ?? "gemini-1.5-flash"),
            allowed_models: typeof d.allowed_models === "string" ? d.allowed_models : JSON.stringify(d.allowed_models ?? [], null, 2),
            safety_settings: typeof d.safety_settings === "string" ? d.safety_settings : JSON.stringify(d.safety_settings ?? {}, null, 2),
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
      let allowed_models: string[] = [];
      let safety_settings: Record<string, unknown> = {};
      try {
        allowed_models = JSON.parse(form.allowed_models);
        safety_settings = JSON.parse(form.safety_settings || "{}");
      } catch {
        toast.error("Invalid JSON");
        setSaving(false);
        return;
      }
      await fetcher.put("/api/admin/control-plane/integrations/gemini", {
        environment: env,
        enabled: form.enabled,
        default_model: form.default_model,
        allowed_models,
        safety_settings,
        ...(form.api_key_secret ? { api_key_secret: form.api_key_secret } : {}),
      });
      setForm((p) => ({ ...p, api_key_secret: "" }));
      setApiKeySet(!!form.api_key_secret || apiKeySet);
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
        <Link href="/admin/control-plane/integrations"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Gemini</h1>
          <p className="text-muted-foreground">API key (stored securely), default model, allowed models, safety settings.</p>
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
            <CardDescription>API key is never returned after save. Leave blank to keep existing key.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div>
              <Label>API key (leave blank to keep current)</Label>
              <Input
                type="password"
                placeholder={apiKeySet ? "••••••••" : "Enter Gemini API key"}
                value={form.api_key_secret}
                onChange={(e) => setForm((p) => ({ ...p, api_key_secret: e.target.value }))}
              />
            </div>
            <div>
              <Label>Default model</Label>
              <Input value={form.default_model} onChange={(e) => setForm((p) => ({ ...p, default_model: e.target.value }))} />
            </div>
            <div>
              <Label>Allowed models (JSON array)</Label>
              <textarea className="w-full min-h-[80px] rounded border p-2 font-mono text-sm" value={form.allowed_models} onChange={(e) => setForm((p) => ({ ...p, allowed_models: e.target.value }))} />
            </div>
            <div>
              <Label>Safety settings (JSON)</Label>
              <textarea className="w-full min-h-[80px] rounded border p-2 font-mono text-sm" value={form.safety_settings} onChange={(e) => setForm((p) => ({ ...p, safety_settings: e.target.value }))} />
            </div>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
