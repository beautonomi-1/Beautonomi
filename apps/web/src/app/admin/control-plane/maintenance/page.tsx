"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft, ExternalLink } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";
import type { MaintenanceScope, MaintenanceScopeConfig } from "@/lib/maintenance-types";
import { MAINTENANCE_SCOPES } from "@/lib/maintenance-types";

const SCOPE_LABELS: Record<MaintenanceScope, string> = {
  public_site: "Customer public site (marketing/booking web)",
  provider_web: "Provider / partner web (/provider)",
  customer_app: "Customer app (Expo)",
  provider_app: "Provider app (Expo)",
};

function getPreviewUrl(scope: MaintenanceScope): string {
  if (typeof window === "undefined") return "#";
  const base = window.location.origin;
  if (scope === "public_site") return `${base}/?maintenance_preview=1`;
  if (scope === "provider_web") return `${base}/provider?maintenance_preview=1`;
  return `${base}/maintenance-preview?scope=${scope}`;
}

export default function MaintenancePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maintenance, setMaintenance] = useState<Record<MaintenanceScope, MaintenanceScopeConfig>>({
    public_site: { enabled: false, title: "", message: "", cta_label: null, countdown_end_at: null, countdown_label: null },
    provider_web: { enabled: false, title: "", message: "", cta_label: null, countdown_end_at: null, countdown_label: null },
    customer_app: { enabled: false, title: "", message: "", cta_label: null, countdown_end_at: null, countdown_label: null },
    provider_app: { enabled: false, title: "", message: "", cta_label: null, countdown_end_at: null, countdown_label: null },
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetcher.get<{ data: Record<MaintenanceScope, MaintenanceScopeConfig> }>("/api/admin/maintenance");
        if (res.data) setMaintenance(res.data);
      } catch {
        toast.error("Failed to load maintenance settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateScope = (scope: MaintenanceScope, patch: Partial<MaintenanceScopeConfig>) => {
    setMaintenance((prev) => ({
      ...prev,
      [scope]: { ...prev[scope], ...patch },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetcher.patch("/api/admin/maintenance", { maintenance });
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="space-y-6">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/admin/control-plane/overview">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Maintenance & Coming Soon</h1>
            <p className="text-muted-foreground">
              Per-scope maintenance or coming-soon pages. Use Preview to open the site in a new tab with maintenance on.{" "}
              <Link href="/admin/control-plane/maintenance/sign-ups" className="underline text-primary">
                View notify sign-ups
              </Link>
            </p>
          </div>
        </div>

        {MAINTENANCE_SCOPES.map((scope) => (
          <Card key={scope}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">{SCOPE_LABELS[scope]}</CardTitle>
                  <CardDescription>Scope: {scope}</CardDescription>
                </div>
                <a
                  href={getPreviewUrl(scope)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Preview <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={maintenance[scope].enabled}
                  onCheckedChange={(v) => updateScope(scope, { enabled: v })}
                />
                <Label>Enable maintenance for this scope</Label>
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={maintenance[scope].title}
                  onChange={(e) => updateScope(scope, { title: e.target.value })}
                  placeholder="We'll be back soon"
                />
              </div>
              <div>
                <Label>Message</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={maintenance[scope].message}
                  onChange={(e) => updateScope(scope, { message: e.target.value })}
                  placeholder="We're performing scheduled maintenance."
                />
              </div>
              <div>
                <Label>CTA button label (optional, e.g. &quot;Notify me when we&apos;re back&quot;)</Label>
                <Input
                  value={maintenance[scope].cta_label ?? ""}
                  onChange={(e) => updateScope(scope, { cta_label: e.target.value || null })}
                  placeholder="Notify me"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Countdown end (optional, UTC)</Label>
                  <Input
                    type="datetime-local"
                    value={
                      maintenance[scope].countdown_end_at
                        ? (() => {
                            const d = new Date(maintenance[scope].countdown_end_at!);
                            const pad = (n: number) => n.toString().padStart(2, "0");
                            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                          })()
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      updateScope(
                        scope,
                        { countdown_end_at: v ? new Date(v).toISOString() : null }
                      );
                    }}
                  />
                </div>
                <div>
                  <Label>Countdown label (e.g. &quot;Launching in&quot;)</Label>
                  <Input
                    value={maintenance[scope].countdown_label ?? ""}
                    onChange={(e) => updateScope(scope, { countdown_label: e.target.value || null })}
                    placeholder="Launching in"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save all"}
          </Button>
        </div>
      </div>
    </RoleGuard>
  );
}
