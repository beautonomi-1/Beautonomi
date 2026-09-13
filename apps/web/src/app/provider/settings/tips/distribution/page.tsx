"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { PageHeader } from "@/components/provider/PageHeader";

interface TipDistributionSettings {
  keep_all_tips: boolean;
  distribute_to_staff: boolean;
}

export default function TipDistributionPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<TipDistributionSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: TipDistributionSettings }>(
        "/api/provider/tips/distribution"
      );
      setSettings(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
? t("web.provider.common.requestTimeout")
          : err instanceof FetchError
          ? err.message
: t("web.provider.settings.pages.tips/distribution.failedToLoadTipDistributionSettings");
      setError(errorMessage);
      console.error("Error loading tip distribution settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/tips/distribution", settings);
      toast.success(t("web.provider.settings.pages.tips/distribution.tipDistributionSettingsSavedSuccessfully"));
    } catch (error) {
      toast.error(t("web.provider.settings.pages.tips/distribution.failedToSaveTipDistributionSettings"));
      console.error("Error saving settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSettings = (updates: Partial<TipDistributionSettings>) => {
    setSettings((prev) => {
      if (!prev) return null;
      const newSettings = { ...prev, ...updates };
      // If keep_all_tips is true, distribute_to_staff should be false
      if (newSettings.keep_all_tips) {
        newSettings.distribute_to_staff = false;
      }
      return newSettings;
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.tips/distribution.loadingTipDistributionSettings")} />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title={t("web.provider.settings.categories.sales.items.tipsDistribution.title")}
description={error || t("web.provider.settings.pages.tips/distribution.unableToLoad")}
          action={{
label: t("web.provider.common.retry"),
            onClick: loadSettings,
          }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
      <PageHeader
        title={t("web.provider.settings.pages.tips/distribution.tipDistribution")}
        subtitle={t("web.provider.settings.categories.sales.items.tipsDistribution.description")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
          { label: t("web.provider.settings.pages.tips/distribution.tipDistribution") }
        ]}
      />

      <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-6 mt-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between border-b pb-4">
            <div className="flex-1">
              <Label htmlFor="keep_all_tips" className="text-sm sm:text-base font-semibold">
{t("web.provider.settings.pages.tips/distribution.keepAllTips")}
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
{t("web.provider.settings.pages.tips/distribution.keepAllTipsHint")}
              </p>
            </div>
            <input
              type="radio"
              id="keep_all_tips"
              name="tip_distribution"
              checked={settings.keep_all_tips}
              onChange={() => updateSettings({ keep_all_tips: true, distribute_to_staff: false })}
              className="w-5 h-5"
            />
          </div>

          <div className="flex items-start justify-between border-b pb-4">
            <div className="flex-1">
              <Label htmlFor="distribute_to_staff" className="text-sm sm:text-base font-semibold">
{t("web.provider.settings.pages.tips/distribution.distributeToStaff")}
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
{t("web.provider.settings.pages.tips/distribution.distributeToStaffHint")}
              </p>
            </div>
            <input
              type="radio"
              id="distribute_to_staff"
              name="tip_distribution"
              checked={settings.distribute_to_staff && !settings.keep_all_tips}
              onChange={() => updateSettings({ keep_all_tips: false, distribute_to_staff: true })}
              className="w-5 h-5"
            />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs sm:text-sm text-blue-800">
<strong>{t("web.provider.settings.pages.tips/distribution.noteLabel")}</strong> {t("web.provider.settings.pages.tips/distribution.noteBody")}
          </p>
        </div>
      </div>

      <div className="mt-4 sm:mt-6 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full sm:w-auto touch-target"
        >
          <Save className="w-4 h-4 me-2" />
{isSaving ? t("web.provider.settings.common.saving") : t("web.provider.common.saveSettings")}
        </Button>
      </div>
    </div>
  );
}
