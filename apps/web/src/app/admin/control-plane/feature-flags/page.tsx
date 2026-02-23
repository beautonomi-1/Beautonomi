"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";

export default function ControlPlaneFeatureFlagsPage() {
  const [flags, setFlags] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<Record<string, { enabled: boolean }> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewForm, setPreviewForm] = useState({
    user_id: "",
    role: "",
    platform: "web",
    environment: "production",
    app_version: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetcher.get<{ data: Array<Record<string, unknown>> }>("/api/admin/feature-flags");
        setFlags(res.data ?? []);
      } catch {
        toast.error("Failed to load feature flags");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const runPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await fetcher.post<{ data: { resolved: Record<string, { enabled: boolean }> } }>(
        "/api/admin/control-plane/flags-preview",
        previewForm
      );
      setPreview(res.data?.resolved ?? null);
    } catch {
      toast.error("Failed to run preview");
    } finally {
        setPreviewLoading(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/control-plane/overview">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Feature Flags</h1>
          <p className="text-muted-foreground">Manage rollouts, platforms, roles, and min version. Use the main <Link className="underline" href="/admin/settings/feature-flags">Feature Flags</Link> page for full CRUD.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview resolver</CardTitle>
          <CardDescription>See how flags resolve for a given user/role/platform/environment/app version.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>User ID (optional)</Label>
              <Input
                placeholder="uuid"
                value={previewForm.user_id}
                onChange={(e) => setPreviewForm((p) => ({ ...p, user_id: e.target.value }))}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={previewForm.role} onValueChange={(v) => setPreviewForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  <SelectItem value="superadmin">superadmin</SelectItem>
                  <SelectItem value="provider_owner">provider_owner</SelectItem>
                  <SelectItem value="provider_staff">provider_staff</SelectItem>
                  <SelectItem value="customer">customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Platform</Label>
              <Select value={previewForm.platform} onValueChange={(v) => setPreviewForm((p) => ({ ...p, platform: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">web</SelectItem>
                  <SelectItem value="customer">customer</SelectItem>
                  <SelectItem value="provider">provider</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Environment</Label>
              <Select value={previewForm.environment} onValueChange={(v) => setPreviewForm((p) => ({ ...p, environment: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">production</SelectItem>
                  <SelectItem value="staging">staging</SelectItem>
                  <SelectItem value="development">development</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>App version (optional)</Label>
              <Input
                placeholder="1.0.0"
                value={previewForm.app_version}
                onChange={(e) => setPreviewForm((p) => ({ ...p, app_version: e.target.value }))}
              />
            </div>
          </div>
          <Button onClick={runPreview} disabled={previewLoading}>{previewLoading ? "Resolving…" : "Resolve"}</Button>
          {preview && (
            <div className="rounded border p-4">
              <p className="text-sm font-medium mb-2">Resolved flags</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(preview).map(([key, v]) => (
                  <Badge key={key} variant={v.enabled ? "default" : "secondary"}>{key}: {v.enabled ? "on" : "off"}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All flags (read-only here)</CardTitle>
            <CardDescription>Edit rollout %, platforms, roles, min_app_version on the main Feature Flags page; changes are logged to config change log.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {flags.map((f) => (
                <li key={String(f.id)} className="flex items-center gap-2">
                  <Badge variant={(f.enabled as boolean) ? "default" : "secondary"}>
                    {String(f.feature_key)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    rollout={Number(f.rollout_percent ?? 100)}%
                    {(f.platforms_allowed as string[] | null)?.length ? ` · platforms=${(f.platforms_allowed as string[]).join(",")}` : ""}
                    {(f.roles_allowed as string[] | null)?.length ? ` · roles=${(f.roles_allowed as string[]).join(",")}` : ""}
                    {f.min_app_version ? ` · min=${f.min_app_version}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
    </RoleGuard>
  );
}
