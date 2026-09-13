"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Save, Bell, MessageSquare, Clock, Users } from "lucide-react";

export default function WaitlistSettings() {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState({
    enableIntelligentWaitlist: true,
    autoNotifyOnAvailability: true,
    notifyPriorityFirst: true,
    notificationDelayMinutes: 0, // Minutes to wait before notifying
    allowClientSelfCheckIn: true,
    allowOnlineWaitlist: true,
    waitlistAutoBookingEnabled: false, // Auto-booking for waitlist entries
    maxWaitlistSize: 50,
    autoRemoveAfterDays: 30, // Auto-remove entries after X days
    enableVirtualWaitingRoom: true,
    showEstimatedWaitTime: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const response = await fetcher.get<{
        data: {
          enableIntelligentWaitlist: boolean;
          autoNotifyOnAvailability: boolean;
          notifyPriorityFirst: boolean;
          notificationDelayMinutes: number;
          allowClientSelfCheckIn: boolean;
          allowOnlineWaitlist: boolean;
          waitlistAutoBookingEnabled: boolean;
          maxWaitlistSize: number;
          autoRemoveAfterDays: number;
          enableVirtualWaitingRoom: boolean;
          showEstimatedWaitTime: boolean;
        } | null;
      }>("/api/provider/settings/waitlist", { staleTimeMs: 0 });
      const payload = response.data;
      if (payload && typeof payload === "object") {
        setSettings((prev) => ({ ...prev, ...payload }));
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
      const message =
        error instanceof Error ? error.message : t("web.provider.settings.pages.appointment-activity/waitlist.couldNotLoad");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/settings/waitlist", {
        enable_intelligent_waitlist: settings.enableIntelligentWaitlist,
        auto_notify_on_availability: settings.autoNotifyOnAvailability,
        notify_priority_first: settings.notifyPriorityFirst,
        notification_delay_minutes: settings.notificationDelayMinutes,
        allow_client_self_check_in: settings.allowClientSelfCheckIn,
        allow_online_waitlist: settings.allowOnlineWaitlist,
        waitlist_auto_booking_enabled: settings.waitlistAutoBookingEnabled,
        max_waitlist_size: settings.maxWaitlistSize,
        auto_remove_after_days: settings.autoRemoveAfterDays,
        enable_virtual_waiting_room: settings.enableVirtualWaitingRoom,
        show_estimated_wait_time: settings.showEstimatedWaitTime,
      });
      toast.success(t("web.provider.settings.pages.appointment-activity/waitlist.waitlistSettingsSavedSuccessfully"));
    } catch (error: any) {
      console.error("Failed to save settings:", error);
      toast.error(error.message || t("web.provider.settings.pages.appointment-activity/waitlist.failedToSave"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("web.provider.settings.categories.appointmentActivity.items.waitlist.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.waitlist.description")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
          { label: t("web.provider.settings.pages.appointment-activity/waitlist.waitlist") },
        ]}
      />

      {loadError ? (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-red-800">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-red-300 text-red-900 hover:bg-red-100"
            onClick={() => void loadSettings()}
          >
            {t("web.provider.common.retry")}
          </Button>
        </div>
      ) : null}

      <div className={`space-y-6 ${loading ? "pointer-events-none opacity-60" : ""}`}>
        {/* Intelligent Waitlist */}
        <SectionCard>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Bell className="w-5 h-5" />
                {t("web.provider.settings.pages.appointment-activity/waitlist.intelligentTitle")}
              </h3>
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.appointment-activity/waitlist.intelligentSubtitle")}
              </p>
            </div>

            <Separator />

            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
              <Switch
                checked={settings.enableIntelligentWaitlist}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, enableIntelligentWaitlist: checked })
                }
                className="mt-1"
              />
              <div className="flex-1">
                <Label className="text-base font-medium cursor-pointer">
                  {t("web.provider.settings.pages.appointment-activity/waitlist.enableIntelligent")}
                </Label>
                <p className="text-sm text-gray-500 mt-1">
                  {t("web.provider.settings.pages.appointment-activity/waitlist.enableIntelligentHint")}
                </p>
              </div>
            </div>

            {settings.enableIntelligentWaitlist && (
              <div className="ms-0 sm:ms-12 space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-4 p-3 bg-white rounded-lg">
                  <Switch
                    checked={settings.autoNotifyOnAvailability}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, autoNotifyOnAvailability: checked })
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label className="text-sm font-medium cursor-pointer">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.autoNotify")}
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.autoNotifyHint")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-3 bg-white rounded-lg">
                  <Switch
                    checked={settings.notifyPriorityFirst}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, notifyPriorityFirst: checked })
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label className="text-sm font-medium cursor-pointer">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.notifyPriority")}
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.notifyPriorityHint")}
                    </p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="notificationDelay" className="text-sm font-medium">
                    {t("web.provider.settings.pages.appointment-activity/waitlist.notificationDelay")}
                  </Label>
                  <Input
                    id="notificationDelay"
                    type="number"
                    min={0}
                    max={60}
                    value={settings.notificationDelayMinutes}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        notificationDelayMinutes: parseInt(e.target.value) || 0,
                      })
                    }
                    className="mt-1.5 max-w-[120px]"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">
                    {t("web.provider.settings.pages.appointment-activity/waitlist.notificationDelayHint")}
                  </p>
                </div>

                <div className="flex items-start gap-4 p-3 bg-white rounded-lg border-2 border-orange-200">
                  <Switch
                    checked={settings.waitlistAutoBookingEnabled}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, waitlistAutoBookingEnabled: checked })
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label className="text-sm font-medium cursor-pointer">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.autoBooking")}
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.autoBookingHint")}
                    </p>
                    <p className="text-xs text-orange-600 mt-1 font-medium">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.autoBookingNote")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Virtual Waiting Room */}
        <SectionCard>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Users className="w-5 h-5" />
                {t("web.provider.settings.pages.appointment-activity/waitlist.virtualTitle")}
              </h3>
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.appointment-activity/waitlist.virtualSubtitle")}
              </p>
            </div>

            <Separator />

            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
              <Switch
                checked={settings.enableVirtualWaitingRoom}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, enableVirtualWaitingRoom: checked })
                }
                className="mt-1"
              />
              <div className="flex-1">
                <Label className="text-base font-medium cursor-pointer">
                  {t("web.provider.settings.pages.appointment-activity/waitlist.enableVirtual")}
                </Label>
                <p className="text-sm text-gray-500 mt-1">
                  {t("web.provider.settings.pages.appointment-activity/waitlist.enableVirtualHint")}
                </p>
              </div>
            </div>

            {settings.enableVirtualWaitingRoom && (
              <div className="ms-0 sm:ms-12 space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-4 p-3 bg-white rounded-lg">
                  <Switch
                    checked={settings.allowClientSelfCheckIn}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, allowClientSelfCheckIn: checked })
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label className="text-sm font-medium cursor-pointer">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.selfCheckIn")}
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.selfCheckInHint")}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-3 bg-white rounded-lg">
                  <Switch
                    checked={settings.showEstimatedWaitTime}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, showEstimatedWaitTime: checked })
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label className="text-sm font-medium cursor-pointer">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.showWaitTime")}
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.appointment-activity/waitlist.showWaitTimeHint")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Online Waitlist */}
        <SectionCard>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                {t("web.provider.settings.pages.appointment-activity/waitlist.onlineTitle")}
              </h3>
              <p className="text-sm text-gray-600">
                {t("web.provider.settings.pages.appointment-activity/waitlist.onlineSubtitle")}
              </p>
            </div>

            <Separator />

            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
              <Switch
                checked={settings.allowOnlineWaitlist}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, allowOnlineWaitlist: checked })
                }
                className="mt-1"
              />
              <div className="flex-1">
                <Label className="text-base font-medium cursor-pointer">
                  {t("web.provider.settings.pages.appointment-activity/waitlist.allowOnline")}
                </Label>
                <p className="text-sm text-gray-500 mt-1">
                  {t("web.provider.settings.pages.appointment-activity/waitlist.allowOnlineHint")}
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* General Settings */}
        <SectionCard>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                {t("web.provider.settings.pages.appointment-activity/waitlist.generalSettings")}
              </h3>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <Label htmlFor="maxWaitlistSize" className="text-sm font-medium">
                  {t("web.provider.settings.pages.appointment-activity/waitlist.maxSize")}
                </Label>
                <Input
                  id="maxWaitlistSize"
                  type="number"
                  min={10}
                  max={500}
                  value={settings.maxWaitlistSize}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxWaitlistSize: parseInt(e.target.value) || 50,
                    })
                  }
                  className="mt-1.5 max-w-[120px]"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  {t("web.provider.settings.pages.appointment-activity/waitlist.maxSizeHint")}
                </p>
              </div>

              <div>
                <Label htmlFor="autoRemoveAfterDays" className="text-sm font-medium">
                  {t("web.provider.settings.pages.appointment-activity/waitlist.autoRemove")}
                </Label>
                <Input
                  id="autoRemoveAfterDays"
                  type="number"
                  min={1}
                  max={365}
                  value={settings.autoRemoveAfterDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      autoRemoveAfterDays: parseInt(e.target.value) || 30,
                    })
                  }
                  className="mt-1.5 max-w-[120px]"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  {t("web.provider.settings.pages.appointment-activity/waitlist.autoRemoveHint")}
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
          >
            <Save className="w-4 h-4 me-2" />
            {isSaving ? t("web.provider.common.saving") : t("web.provider.common.saveSettings")}
          </Button>
        </div>
      </div>
    </div>
  );
}
