"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

export default function UpsellingSettings() {
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: { enabled: boolean } }>(
        "/api/provider/settings/sales/upselling"
      );
      setEnabled(response.data.enabled);
    } catch (error: any) {
      console.error("Error loading settings:", error);
      // Keep default on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/settings/sales/upselling", {
        upselling_enabled: enabled,
      });
      toast.success("Upselling settings saved");
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Sales", href: "/provider/settings/sales/yoco-integration" },
    { label: "Upselling" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Upselling"
        subtitle="Configure upselling preferences"
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <div className="text-center py-8 text-sm text-gray-600">Loading...</div>
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Upselling"
      subtitle="Configure upselling preferences"
      onSave={handleSave}
      saveLabel={isSaving ? "Saving..." : "Save Changes"}
      saveDisabled={isSaving}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex-1">
            <Label className="text-base font-medium cursor-pointer">Enable Upselling</Label>
            <p className="text-sm text-gray-600 mt-1">Suggest additional services or products</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
