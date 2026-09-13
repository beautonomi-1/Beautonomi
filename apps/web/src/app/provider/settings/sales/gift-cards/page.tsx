"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

export default function GiftCardsSettings() {
  const { t } = useTranslation();
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
        "/api/provider/settings/sales/gift-cards"
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
      await fetcher.patch("/api/provider/settings/sales/gift-cards", {
        gift_cards_enabled: enabled,
      });
      toast.success(t("web.provider.settings.pages.sales/gift-cards.giftCardSettingsSaved"));
    } catch (error: any) {
toast.error(error.message || t("web.provider.settings.pages.sales/gift-cards.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.sales/gift-cards.sales"), href: "/provider/settings/sales/yoco-integration" },
    { label: t("web.provider.settings.pages.sales/gift-cards.giftCards") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.sales.items.giftCards.title")}
        subtitle={t("web.provider.settings.categories.sales.items.giftCards.description")}
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
<div className="text-center py-8 text-sm text-gray-600">{t("web.provider.settings.common.loading")}</div>
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.sales/gift-cards.giftCards")}
      subtitle={t("web.provider.settings.pages.sales/gift-cards.manageGiftCardSettings")}
      onSave={handleSave}
      saveLabel={isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.common.saveChanges")}
      saveDisabled={isSaving}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex-1">
<Label className="text-base font-medium cursor-pointer">{t("web.provider.settings.pages.sales/gift-cards.enableTitle")}</Label>
            <p className="text-sm text-gray-600 mt-1">
{t("web.provider.settings.pages.sales/gift-cards.enableHint")}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
