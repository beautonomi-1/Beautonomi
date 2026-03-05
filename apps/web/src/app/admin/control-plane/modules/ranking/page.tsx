"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft, RefreshCw, ListOrdered } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";

export default function RankingModulePage() {
  const [env, setEnv] = useState("production");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    weights: "{}",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data: Record<string, any> | null }>(`/api/admin/control-plane/modules/ranking?environment=${env}`);
        const d = res.data;
        if (d) {
          setForm({
            enabled: Boolean(d.enabled),
            weights: typeof d.weights === "string" ? d.weights : JSON.stringify(d.weights ?? {}, null, 2),
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
      let weights: Record<string, any> = {};
      try {
        weights = JSON.parse(form.weights || "{}");
      } catch {
        toast.error("Invalid JSON in weights");
        setSaving(false);
        return;
      }
      await fetcher.put("/api/admin/control-plane/modules/ranking", {
        environment: env,
        enabled: form.enabled,
        weights,
      });
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const recomputeAll = async () => {
    setRecomputing(true);
    try {
      const res = await fetcher.post<{ data: { recomputed?: number; message?: string } }>("/api/admin/ranking/recompute", {
        full: true,
        environment: env,
      });
      const msg = res.data?.message ?? `Recomputed ${res.data?.recomputed ?? 0} providers.`;
      toast.success(msg);
    } catch {
      toast.error("Failed to recompute scores");
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/control-plane/overview"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Ranking Module</h1>
          <p className="text-muted-foreground">SEO-like quality scoring & discoverability. Weights for response time, completion rate, reviews, etc.</p>
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
            <CardDescription>
              When enabled, Top Rated and Hottest on the home page are re-ordered by this score. Weights JSON: e.g. reviews_score, completion_rate, cancellations, response_time (default 0.3, 0.3, 0.2, 0.2).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div>
              <Label>Weights (JSON)</Label>
              <textarea className="w-full min-h-[120px] rounded border p-2 font-mono text-sm" value={form.weights} onChange={(e) => setForm((p) => ({ ...p, weights: e.target.value }))} placeholder='{"reviews_score":0.3,"completion_rate":0.3,"cancellations":0.2,"response_time":0.2}' />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button variant="outline" onClick={recomputeAll} disabled={recomputing} className="gap-2">
                <RefreshCw className={recomputing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {recomputing ? "Recomputing…" : "Recompute all scores"}
              </Button>
              <Link href="/admin/control-plane/modules/ranking/scores">
                <Button variant="secondary" className="gap-2">
                  <ListOrdered className="h-4 w-4" />
                  View quality scores
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </RoleGuard>
  );
}
