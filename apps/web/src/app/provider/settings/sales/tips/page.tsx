"use client";

import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

export default function TipsSettings() {
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetcher.get<{ data: { tips_enabled: boolean } }>(
          "/api/provider/settings/sales/tips"
        );
        setTipsEnabled(Boolean(res.data.tips_enabled));
      } catch {
        // keep default
      }
    };
    load();
  }, []);

  const onSave = async () => {
    try {
      setIsSaving(true);
      const res = await fetcher.patch<{ data: { tips_enabled: boolean } }>(
        "/api/provider/settings/sales/tips",
        { tips_enabled: Boolean(tipsEnabled) }
      );
      setTipsEnabled(Boolean(res.data.tips_enabled));
      toast.success("Tip settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save tip settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsDetailLayout
      title="Tips"
      subtitle="Manage tip settings"
      onSave={onSave}
      isSaving={isSaving}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Sales", href: "/provider/settings/sales/yoco-integration" },
        { label: "Tips" },
      ]}
    >

      <SectionCard>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-medium">Enable Tips</Label>
            <p className="text-sm text-gray-600">Allow customers to add tips</p>
          </div>
          <Switch checked={tipsEnabled} onCheckedChange={setTipsEnabled} />
        </div>

      </SectionCard>
    </SettingsDetailLayout>
  );
}
