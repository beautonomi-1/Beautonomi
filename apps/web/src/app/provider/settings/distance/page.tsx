"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2 } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";

interface DistanceSettings {
  max_service_distance_km: number;
  is_distance_filter_enabled: boolean;
}

export default function DistanceSettingsPage() {
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
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load distance settings";
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
      toast.success("Distance settings saved successfully");
    } catch (error) {
      toast.error("Failed to save distance settings");
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
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Distance Settings" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <LoadingTimeout loadingMessage="Loading distance settings..." />
      </SettingsDetailLayout>
    );
  }

  if (error || !settings) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <EmptyState
          title="Failed to load distance settings"
          description={error || "Unable to load distance settings"}
          action={{
            label: "Retry",
            onClick: loadSettings,
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs}>
      <PageHeader
        title="Service Distance Settings"
        subtitle="Configure how far you're willing to travel for house calls"
      />

      <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <Label htmlFor="is_distance_filter_enabled" className="text-sm sm:text-base">
              Enable Distance Filter
            </Label>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Limit house call bookings to customers within your specified distance
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
          <div>
            <Label htmlFor="max_service_distance_km" className="text-sm sm:text-base">
              Maximum Service Distance (km) *
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="max_service_distance_km"
                type="number"
                min="1"
                max="100"
                step="1"
                value={settings.max_service_distance_km}
                onChange={(e) =>
                  updateSettings({
                    max_service_distance_km: parseFloat(e.target.value) || 1,
                  })
                }
                className="flex-1"
                required
              />
              <span className="text-sm text-gray-600">km</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Maximum distance you're willing to travel for house call services. 
              Customers outside this radius will not be able to book house calls with you.
            </p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs sm:text-sm text-blue-800">
            <strong>Note:</strong> Distance is calculated from your primary business location 
            to the customer's address. This setting only applies to house call bookings. 
            Salon bookings are not affected by this distance limit.
          </p>
        </div>
      </div>

      <div className="mt-4 sm:mt-6 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving || !settings.is_distance_filter_enabled || !settings.max_service_distance_km}
          className="w-full sm:w-auto touch-target bg-[#FF0077] hover:bg-[#D60565]"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </SettingsDetailLayout>
  );
}
