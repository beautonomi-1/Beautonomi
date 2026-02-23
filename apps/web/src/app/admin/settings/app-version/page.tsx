"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Save, Smartphone, AlertCircle } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";

interface AppVersionSettings {
  ios: {
    min_version: string;
    latest_version: string;
    force_update: boolean;
    update_url: string;
  };
  android: {
    min_version: string;
    latest_version: string;
    force_update: boolean;
    update_url: string;
  };
}

export default function AppVersionSettingsPage() {
  const [settings, setSettings] = useState<AppVersionSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ios" | "android">("ios");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: AppVersionSettings }>(
        "/api/admin/app-version"
      );
      setSettings(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load app version settings";
      setError(errorMessage);
      console.error("Error loading app version settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setIsSaving(true);
      await fetcher.patch("/api/admin/app-version", settings);
      toast.success("App version settings saved successfully");
    } catch (error) {
      toast.error("Failed to save app version settings");
      console.error("Error saving settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const updatePlatformSettings = (
    platform: "ios" | "android",
    updates: Partial<AppVersionSettings["ios"] | AppVersionSettings["android"]>
  ) => {
    setSettings((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        [platform]: { ...prev[platform], ...updates },
      };
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading app version settings..." />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load app version settings"
          description={error || "Unable to load app version settings"}
          action={{
            label: "Retry",
            onClick: loadSettings,
          }}
        />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2 flex items-center gap-2">
            <Smartphone className="w-6 h-6 sm:w-8 sm:h-8" />
            App Version Management
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Configure minimum app versions and force update settings for iOS and Android
          </p>
          <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 space-y-2">
            <p className="font-medium text-gray-900">How this works with Expo &amp; OTA</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li><strong>This page</strong> controls <strong>native app version</strong> checks: min required version, latest store version, store URLs, and whether to force an update when the user is below the minimum. The customer and provider Expo apps call <code className="bg-gray-200 px-1 rounded">/api/public/app-version</code> on launch and show &quot;Update required&quot; or &quot;Update available&quot; using these values.</li>
              <li><strong>OTA (Over-The-Air) updates</strong> are separate: they deliver new JavaScript bundles without a new store build. OTA is configured in EAS (e.g. <code className="bg-gray-200 px-1 rounded">eas update --branch production</code>) and in each app&apos;s <code className="bg-gray-200 px-1 rounded">app.config</code> / <code className="bg-gray-200 px-1 rounded">eas.json</code> (channels: development, preview, production). This admin page does <em>not</em> control OTA—only store version checks and force-update prompts.</li>
              <li>When you release a new <strong>store build</strong>, update the &quot;Latest available version&quot; and optionally the &quot;Minimum required version&quot; and &quot;Force update&quot; here so devices know to prompt users to update.</li>
            </ul>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "ios" | "android")}>
          <TabsList className="mb-4 sm:mb-6">
            <TabsTrigger value="ios" className="text-xs sm:text-sm">
              <Smartphone className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              iOS
            </TabsTrigger>
            <TabsTrigger value="android" className="text-xs sm:text-sm">
              <Smartphone className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Android
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ios">
            <IOSVersionSettings
              settings={settings.ios}
              onChange={(updates) => updatePlatformSettings("ios", updates)}
            />
          </TabsContent>

          <TabsContent value="android">
            <AndroidVersionSettings
              settings={settings.android}
              onChange={(updates) => updatePlatformSettings("android", updates)}
            />
          </TabsContent>
        </Tabs>

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
    </RoleGuard>
  );
}

function IOSVersionSettings({
  settings,
  onChange,
}: {
  settings: AppVersionSettings["ios"];
  onChange: (updates: Partial<AppVersionSettings["ios"]>) => void;
}) {
  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="w-5 h-5 text-orange-500" />
        <h3 className="text-base sm:text-lg font-semibold">iOS App Version Settings</h3>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-xs sm:text-sm text-blue-800">
          <strong>Note:</strong> When force update is enabled, users with versions below the minimum
          version will be required to update before using the app. The update URL should point to
          the App Store listing.
        </p>
      </div>

      <div>
        <Label htmlFor="ios_min_version" className="text-sm sm:text-base">
          Minimum Required Version *
        </Label>
        <Input
          id="ios_min_version"
          value={settings.min_version}
          onChange={(e) => onChange({ min_version: e.target.value })}
          placeholder="1.0.0"
          className="mt-1"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Users with versions below this will be prompted to update (e.g., 1.2.0)
        </p>
      </div>

      <div>
        <Label htmlFor="ios_latest_version" className="text-sm sm:text-base">
          Latest Available Version *
        </Label>
        <Input
          id="ios_latest_version"
          value={settings.latest_version}
          onChange={(e) => onChange({ latest_version: e.target.value })}
          placeholder="1.2.5"
          className="mt-1"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Current latest version available in the App Store
        </p>
      </div>

      <div>
        <Label htmlFor="ios_update_url" className="text-sm sm:text-base">
          App Store URL *
        </Label>
        <Input
          id="ios_update_url"
          type="url"
          value={settings.update_url}
          onChange={(e) => onChange({ update_url: e.target.value })}
          placeholder="https://apps.apple.com/app/beautonomi/id123456789"
          className="mt-1"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Direct link to the app in the App Store
        </p>
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <div>
          <Label htmlFor="ios_force_update" className="text-sm sm:text-base">
            Force Update
          </Label>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Require users to update if their version is below the minimum
          </p>
        </div>
        <input
          type="checkbox"
          id="ios_force_update"
          checked={settings.force_update}
          onChange={(e) => onChange({ force_update: e.target.checked })}
          className="w-5 h-5"
        />
      </div>
    </div>
  );
}

function AndroidVersionSettings({
  settings,
  onChange,
}: {
  settings: AppVersionSettings["android"];
  onChange: (updates: Partial<AppVersionSettings["android"]>) => void;
}) {
  return (
    <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="w-5 h-5 text-orange-500" />
        <h3 className="text-base sm:text-lg font-semibold">Android App Version Settings</h3>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-xs sm:text-sm text-blue-800">
          <strong>Note:</strong> When force update is enabled, users with versions below the minimum
          version will be required to update before using the app. The update URL should point to
          the Google Play Store listing.
        </p>
      </div>

      <div>
        <Label htmlFor="android_min_version" className="text-sm sm:text-base">
          Minimum Required Version *
        </Label>
        <Input
          id="android_min_version"
          value={settings.min_version}
          onChange={(e) => onChange({ min_version: e.target.value })}
          placeholder="1.0.0"
          className="mt-1"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Users with versions below this will be prompted to update (e.g., 1.2.0)
        </p>
      </div>

      <div>
        <Label htmlFor="android_latest_version" className="text-sm sm:text-base">
          Latest Available Version *
        </Label>
        <Input
          id="android_latest_version"
          value={settings.latest_version}
          onChange={(e) => onChange({ latest_version: e.target.value })}
          placeholder="1.2.5"
          className="mt-1"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Current latest version available in the Google Play Store
        </p>
      </div>

      <div>
        <Label htmlFor="android_update_url" className="text-sm sm:text-base">
          Google Play Store URL *
        </Label>
        <Input
          id="android_update_url"
          type="url"
          value={settings.update_url}
          onChange={(e) => onChange({ update_url: e.target.value })}
          placeholder="https://play.google.com/store/apps/details?id=com.beautonomi"
          className="mt-1"
          required
        />
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          Direct link to the app in the Google Play Store
        </p>
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <div>
          <Label htmlFor="android_force_update" className="text-sm sm:text-base">
            Force Update
          </Label>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Require users to update if their version is below the minimum
          </p>
        </div>
        <input
          type="checkbox"
          id="android_force_update"
          checked={settings.force_update}
          onChange={(e) => onChange({ force_update: e.target.checked })}
          className="w-5 h-5"
        />
      </div>
    </div>
  );
}
