"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { MapPin, Loader2 } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ServiceArea = {
  provider_id: string;
  mode: "radius" | "zones";
  radius_km: number | null;
  home_latitude: number | null;
  home_longitude: number | null;
  zones: unknown[];
};

export default function ServiceAreaPage() {
  const distanceConfig = useModuleConfig("distance") as { enabled?: boolean; default_radius_km?: number; max_radius_km?: number } | undefined;
  const radiusEnabled = useFeatureFlag("distance.provider_radius.enabled");
  const [data, setData] = useState<ServiceArea | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    mode: "radius" as "radius" | "zones",
    radius_km: "",
    home_latitude: "",
    home_longitude: "",
  });

  const enabled = Boolean(distanceConfig?.enabled) || radiusEnabled;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetcher.get<{ data: ServiceArea | null }>("/api/provider/service-area");
        const d = res.data;
        if (d) {
          setData(d);
          setForm({
            mode: d.mode ?? "radius",
            radius_km: d.radius_km != null ? String(d.radius_km) : "",
            home_latitude: d.home_latitude != null ? String(d.home_latitude) : "",
            home_longitude: d.home_longitude != null ? String(d.home_longitude) : "",
          });
        }
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetcher.put("/api/provider/service-area", {
        mode: form.mode,
        radius_km: form.mode === "radius" && form.radius_km ? parseFloat(form.radius_km) : null,
        home_latitude: form.mode === "radius" && form.home_latitude ? parseFloat(form.home_latitude) : null,
        home_longitude: form.mode === "radius" && form.home_longitude ? parseFloat(form.home_longitude) : null,
        zones: form.mode === "zones" ? (data?.zones ?? []) : [],
      });
      toast.success("Service area saved");
      const res = await fetcher.get<{ data: ServiceArea | null }>("/api/provider/service-area");
      setData(res.data ?? null);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SettingsDetailLayout title="Service area" subtitle="Set your service radius or zones for house calls.">
        <LoadingTimeout loadingMessage="Loading..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout title="Service area" subtitle="Define how far you travel for at-home bookings (Tinder-style radius).">
      {!enabled && (
        <Alert className="mb-6">
          <AlertDescription>Service area is not enabled. Enable the distance module in Control Plane to use this.</AlertDescription>
        </Alert>
      )}

      <SectionCard title="Service area">
        <div className="space-y-6">
          <RadioGroup
            value={form.mode}
            onValueChange={(v) => setForm((p) => ({ ...p, mode: v as "radius" | "zones" }))}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="radius" id="mode-radius" />
              <Label htmlFor="mode-radius">Radius (km from my location)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="zones" id="mode-zones" />
              <Label htmlFor="mode-zones">Zones (use Service Zones)</Label>
            </div>
          </RadioGroup>

          {form.mode === "radius" && (
            <>
              <div>
                <Label>Radius (km)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder={String(distanceConfig?.default_radius_km ?? 10)}
                  value={form.radius_km}
                  onChange={(e) => setForm((p) => ({ ...p, radius_km: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Home latitude (optional)</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="e.g. -33.9249"
                    value={form.home_latitude}
                    onChange={(e) => setForm((p) => ({ ...p, home_latitude: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Home longitude (optional)</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="e.g. 18.4241"
                    value={form.home_longitude}
                    onChange={(e) => setForm((p) => ({ ...p, home_longitude: e.target.value }))}
                  />
                </div>
              </div>
            </>
          )}

          {form.mode === "zones" && (
            <p className="text-sm text-muted-foreground">
              Manage your service zones in <a href="/provider/settings/service-zones" className="text-primary underline">Service Zones</a>. They will be used for at-home booking availability.
            </p>
          )}

          <Button onClick={save} disabled={saving || !enabled}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : <><MapPin className="h-4 w-4 mr-2" /> Save</>}
          </Button>
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
