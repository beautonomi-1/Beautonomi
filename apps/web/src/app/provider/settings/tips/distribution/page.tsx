"use client";

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
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load tip distribution settings";
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
      toast.success("Tip distribution settings saved successfully");
    } catch (error) {
      toast.error("Failed to save tip distribution settings");
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
        <LoadingTimeout loadingMessage="Loading tip distribution settings..." />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load tip distribution settings"
          description={error || "Unable to load tip distribution settings"}
          action={{
            label: "Retry",
            onClick: loadSettings,
          }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
      <PageHeader
        title="Tip Distribution"
        subtitle="Choose how tips are distributed between you and your staff"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Tip Distribution" }
        ]}
      />

      <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-6 mt-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between border-b pb-4">
            <div className="flex-1">
              <Label htmlFor="keep_all_tips" className="text-sm sm:text-base font-semibold">
                Keep All Tips
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                All tips will be kept by the business owner. Staff will not receive any portion of tips.
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
                Distribute Tips to Staff
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Tips will be distributed to the staff members who provided the service. 
                Distribution is based on which staff member was assigned to the booking.
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
            <strong>Note:</strong> When "Distribute Tips to Staff" is enabled, tips will be automatically 
            allocated to the staff member who was assigned to each booking. You can change this setting 
            at any time, but it will only affect future bookings.
          </p>
        </div>
      </div>

      <div className="mt-4 sm:mt-6 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full sm:w-auto touch-target"
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
