"use client";

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
  const [isSaving, setIsSaving] = useState(false);
  
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
        };
      }>("/api/provider/settings/waitlist");
      setSettings(response.data);
    } catch (error) {
      console.error("Failed to load settings:", error);
      // Keep defaults on error
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
      toast.success("Waitlist settings saved successfully");
    } catch (error: any) {
      console.error("Failed to save settings:", error);
      toast.error(error.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Waitlist Settings"
        subtitle="Configure intelligent waitlist and virtual waiting room preferences"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Waitlist" },
        ]}
      />

      <div className="space-y-6">
        {/* Intelligent Waitlist */}
        <SectionCard>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Intelligent Waitlist
              </h3>
              <p className="text-sm text-gray-600">
                Automatically notify clients when appointments become available
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
                  Enable Intelligent Waitlist
                </Label>
                <p className="text-sm text-gray-500 mt-1">
                  Automatically notify waitlist clients when appointment slots open up
                </p>
              </div>
            </div>

            {settings.enableIntelligentWaitlist && (
              <div className="ml-0 sm:ml-12 space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
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
                      Auto-notify when slots become available
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      Automatically send notifications to waitlist clients when appointments are cancelled or new slots open
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
                      Notify high priority entries first
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      High priority waitlist entries will be notified before normal priority entries
                    </p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="notificationDelay" className="text-sm font-medium">
                    Notification Delay (minutes)
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
                    Wait this many minutes before sending notifications (helps prevent spam if multiple slots open)
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
                      Auto-booking for waitlist entries
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      Automatically create bookings for waitlist clients when matching slots become available. 
                      Clients will still receive notifications, but their booking will be created automatically.
                    </p>
                    <p className="text-xs text-orange-600 mt-1 font-medium">
                      Note: Auto-booked appointments will be in "pending" status and require payment confirmation.
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
                Virtual Waiting Room
              </h3>
              <p className="text-sm text-gray-600">
                Allow clients to check in and wait virtually
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
                  Enable Virtual Waiting Room
                </Label>
                <p className="text-sm text-gray-500 mt-1">
                  Allow clients to check in themselves and wait virtually before their appointment
                </p>
              </div>
            </div>

            {settings.enableVirtualWaitingRoom && (
              <div className="ml-0 sm:ml-12 space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
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
                      Allow client self check-in
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      Clients can check themselves into the waiting room via online booking or mobile app
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
                      Show estimated wait time
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      Display estimated wait time to clients in the waiting room
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
                Online Waitlist
              </h3>
              <p className="text-sm text-gray-600">
                Allow clients to join waitlist from online booking
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
                  Allow clients to join waitlist online
                </Label>
                <p className="text-sm text-gray-500 mt-1">
                  Clients can add themselves to the waitlist when no appointments are available in online booking
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
                General Settings
              </h3>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <Label htmlFor="maxWaitlistSize" className="text-sm font-medium">
                  Maximum Waitlist Size
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
                  Maximum number of active waitlist entries allowed
                </p>
              </div>

              <div>
                <Label htmlFor="autoRemoveAfterDays" className="text-sm font-medium">
                  Auto-remove after (days)
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
                  Automatically remove waitlist entries after this many days if not converted to appointment
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
            className="bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
