"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2 } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import Link from "next/link";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";

interface DistanceSettings {
  max_service_distance_km: number;
  is_distance_filter_enabled: boolean;
}

export default function DistanceSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<DistanceSettings | null>(null);
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

      const response = await fetcher.get<{ data: DistanceSettings }>(
        "/api/provider/distance-settings"
      );
      setSettings(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? t("web.provider.common.requestTimeout")
          : err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.distance.failedToLoadDistanceSettings");
      setError(errorMessage);
      console.error("Error loading distance settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/distance-settings", settings);
      toast.success(t("web.provider.settings.pages.distance.distanceSettingsSavedSuccessfully"));
    } catch (error) {
      toast.error(t("web.provider.settings.pages.distance.failedToSaveDistanceSettings"));
      console.error("Error saving settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSettings = (updates: Partial<DistanceSettings>) => {
    setSettings((prev) => {
      if (!prev) return null;
      return { ...prev, ...updates };
    });
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.distance.distanceSettings") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.distance.loadingDistanceSettings")} />
      </SettingsDetailLayout>
    );
  }

  if (error || !settings) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <EmptyState
          title={t("web.provider.settings.categories.appointmentActivity.items.distance.title")}
          description={error || t("web.provider.settings.pages.distance.unableToLoad")}
          action={{
            label: t("web.provider.common.retry"),
            onClick: loadSettings,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs}>
      <PageHeader
        title={t("web.provider.settings.categories.appointmentActivity.items.distance.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.distance.description")}
      />

      <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <Label htmlFor="is_distance_filter_enabled" className="text-sm sm:text-base">
{t("web.provider.settings.pages.distance.enableFilter")}
            </Label>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
{t("web.provider.settings.pages.distance.enableFilterHint")}
            </p>
          </div>
          <input
            type="checkbox"
            id="is_distance_filter_enabled"
            checked={settings.is_distance_filter_enabled}
            onChange={(e) =>
              updateSettings({ is_distance_filter_enabled: e.target.checked })
            }
            className="w-5 h-5"
          />
        </div>

        {settings.is_distance_filter_enabled && (
          <div className="space-y-3">
            <Label htmlFor="max_service_distance_km" className="text-sm sm:text-base">
{t("web.provider.settings.pages.distance.maxDistanceRequired")}
            </Label>
            {/* Slider + value display */}
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xl font-bold text-gray-900 tabular-nums">
{t("web.provider.settings.pages.distance.kmValue", { km: settings.max_service_distance_km })}
                </span>
<span className="text-sm text-gray-500">{t("web.provider.settings.pages.distance.dragToAdjust")}</span>
              </div>
              <input
                type="range"
                id="max_service_distance_km_slider"
                min={1}
                max={100}
                step={1}
                value={settings.max_service_distance_km}
                onChange={(e) =>
                  updateSettings({
                    max_service_distance_km: parseFloat(e.target.value) || 1,
                  })
                }
                className="distance-slider h-3 w-full cursor-pointer appearance-none rounded-full bg-gray-200 focus:outline-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow"
                style={{ accentColor: "var(--primary)" }}
                aria-valuemin={1}
                aria-valuemax={100}
                aria-valuenow={settings.max_service_distance_km}
aria-label={t("web.provider.settings.pages.distance.maxDistanceA11y")}
              />
              <div className="flex justify-between text-xs text-gray-400">
<span>{t("web.provider.settings.pages.distance.sliderMin")}</span>
<span>{t("web.provider.settings.pages.distance.sliderMax")}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="max_service_distance_km"
                type="number"
                min={1}
                max={100}
                step={1}
                value={settings.max_service_distance_km}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v)) updateSettings({ max_service_distance_km: Math.min(100, Math.max(1, v)) });
                }}
                className="w-24"
                required
              />
<span className="text-sm text-gray-600">{t("web.provider.settings.pages.distance.orTypeExact")}</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">
              {t("web.provider.settings.pages.distance.maxDistanceHint")}
            </p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
          <p className="text-xs sm:text-sm text-blue-800">
            <strong>{t("web.provider.settings.pages.distance.noteStrong")}</strong>
            {t("web.provider.settings.pages.distance.noteBody")}
          </p>
          <p className="text-xs sm:text-sm text-blue-800">
            <Link href="/provider/settings/locations" className="underline font-medium hover:no-underline">
{t("web.provider.settings.pages.distance.manageLocations")}
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-4 sm:mt-6 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving || (settings.is_distance_filter_enabled && (!settings.max_service_distance_km || settings.max_service_distance_km < 1))}
          className="w-full sm:w-auto touch-target bg-primary hover:bg-primary-hover"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 me-2 animate-spin" />
{t("web.provider.common.saving")}
            </>
          ) : (
            <>
              <Save className="w-4 h-4 me-2" />
{t("web.provider.common.saveSettings")}
            </>
          )}
        </Button>
      </div>
    </SettingsDetailLayout>
  );
}
