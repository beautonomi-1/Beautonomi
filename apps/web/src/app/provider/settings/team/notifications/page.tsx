"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { providerApi } from "@/lib/provider-portal/api";
import { fetcher } from "@/lib/http/fetcher";
import type { TeamMember } from "@/lib/provider-portal/types";
import { toast } from "sonner";
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";
import { getUpgradeMessage } from "@/lib/subscriptions/subscription-upgrade-copy";
import Link from "next/link";
import { Bell, Mail, Phone, Monitor, Clock, Calendar, User, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface NotificationSettings {
  email_enabled: boolean;
  sms_enabled: boolean;
  sms_plan_allowed: boolean;
  desktop_enabled: boolean;
  appointment_reminders: boolean;
  appointment_cancellations: boolean;
  appointment_reschedules: boolean;
  new_bookings: boolean;
  daily_schedule: boolean;
  weekly_schedule: boolean;
  reminder_time: string; // e.g., "24h", "2h", "30m"
}

export default function NotificationsSettings() {
  const { t } = useTranslation();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotificationSettings>({
    email_enabled: true,
    sms_enabled: false,
    sms_plan_allowed: false,
    desktop_enabled: false,
    appointment_reminders: true,
    appointment_cancellations: true,
    appointment_reschedules: true,
    new_bookings: true,
    daily_schedule: true,
    weekly_schedule: false,
    reminder_time: "24h",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadTeamMembers();
  }, []);

  useEffect(() => {
    if (selectedMember) {
      loadNotificationSettings(selectedMember);
    }
  }, [selectedMember]);

  const loadTeamMembers = async () => {
    try {
      setIsLoading(true);
      const members = await providerApi.listTeamMembers();
      setTeamMembers(members.filter((m) => m.is_active));
      if (members.length > 0 && !selectedMember) {
        setSelectedMember(members[0].id);
      }
    } catch (error) {
      console.error("Failed to load team members:", error);
      toast.error(t("web.provider.settings.pages.team/notifications.failedToLoadTeamMembers"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadNotificationSettings = async (memberId: string) => {
    try {
      const response = await fetcher.get<{
        data: {
          emailEnabled: boolean;
          smsEnabled: boolean;
          smsPlanAllowed: boolean;
          desktopEnabled: boolean;
          appointmentReminders: boolean;
          appointmentCancellations: boolean;
          appointmentReschedules: boolean;
          newBookings: boolean;
          dailySchedule: boolean;
          weeklySchedule: boolean;
          reminderTime: string;
        };
      }>(`/api/provider/staff/${memberId}/notifications`);
      setSettings({
        email_enabled: response.data.emailEnabled,
        sms_enabled: response.data.smsEnabled,
        sms_plan_allowed: response.data.smsPlanAllowed === true,
        desktop_enabled: response.data.desktopEnabled,
        appointment_reminders: response.data.appointmentReminders,
        appointment_cancellations: response.data.appointmentCancellations,
        appointment_reschedules: response.data.appointmentReschedules,
        new_bookings: response.data.newBookings,
        daily_schedule: response.data.dailySchedule,
        weekly_schedule: response.data.weeklySchedule,
        reminder_time: response.data.reminderTime,
      });
    } catch (error) {
      console.error("Failed to load notification settings:", error);
      // Use default values on error
      setSettings({
        email_enabled: true,
        sms_enabled: false,
        sms_plan_allowed: false,
        desktop_enabled: false,
        appointment_reminders: true,
        appointment_cancellations: true,
        appointment_reschedules: true,
        new_bookings: true,
        daily_schedule: true,
        weekly_schedule: false,
        reminder_time: "24h",
      });
    }
  };

  const handleSave = async () => {
    if (!selectedMember) return;

    setIsSaving(true);
    try {
      await fetcher.patch(`/api/provider/staff/${selectedMember}/notifications`, {
        email_enabled: settings.email_enabled,
        sms_enabled: settings.sms_plan_allowed ? settings.sms_enabled : false,
        desktop_enabled: settings.desktop_enabled,
        appointment_reminders: settings.appointment_reminders,
        appointment_cancellations: settings.appointment_cancellations,
        appointment_reschedules: settings.appointment_reschedules,
        new_bookings: settings.new_bookings,
        daily_schedule: settings.daily_schedule,
        weekly_schedule: settings.weekly_schedule,
        reminder_time: settings.reminder_time,
      });
      toast.success(t("web.provider.settings.pages.team/notifications.notificationSettingsSavedSuccessfully"));
    } catch (error: unknown) {
      console.error("Failed to save notification settings:", error);
      toastPlanGateError(error, t("web.provider.settings.pages.team/notifications.failedToSaveNotificationSettings"));
    } finally {
      setIsSaving(false);
    }
  };

  const selectedMemberData = teamMembers.find((m) => m.id === selectedMember);

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.team.items.teamNotifications.title")}
      subtitle={t("web.provider.settings.categories.team.items.teamNotifications.description")}
      onSave={handleSave}
      saveLabel={isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.pages.team/notifications.saveSettings")}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.pages.team/notifications.team"), href: "/provider/settings/team/roles" },
        { label: t("web.provider.settings.pages.team/notifications.staffNotifications") },
      ]}
    >
      {isLoading ? (
        <SectionCard>
          <Skeleton className="h-64 w-full" />
        </SectionCard>
      ) : teamMembers.length === 0 ? (
        <SectionCard className="p-8 sm:p-12 text-center">
          <p className="text-gray-600 mb-4">{t("web.provider.settings.pages.team/notifications.noActiveTeamMembers")}</p>
          <Button onClick={() => window.location.href = "/provider/team/members"}>
            {t("web.provider.settings.pages.team/notifications.addTeamMembers")}
          </Button>
        </SectionCard>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Team Member Selector */}
          <SectionCard>
            <div className="space-y-4">
              <div>
                <Label className="text-sm sm:text-base font-semibold mb-2 block">
                  {t("web.provider.settings.pages.team/notifications.selectTeamMember")}
                </Label>
                <Select value={selectedMember || ""} onValueChange={setSelectedMember}>
                  <SelectTrigger className="min-h-[44px] touch-manipulation">
                    <SelectValue placeholder={t("web.provider.settings.pages.team/notifications.selectATeamMember")} />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {member.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{member.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedMemberData && (
                <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 sm:w-12 sm:h-12">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {selectedMemberData.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm sm:text-base">{selectedMemberData.name}</p>
                      <p className="text-xs sm:text-sm text-gray-500">{selectedMemberData.email}</p>
                      <p className="text-xs sm:text-sm text-gray-500">{selectedMemberData.mobile}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Notification Channels */}
          {selectedMember && (
            <SectionCard>
              <div className="space-y-4">
                <h3 className="text-sm sm:text-base font-semibold">{t("web.provider.settings.pages.team/notifications.notificationChannels")}</h3>
                <p className="text-xs sm:text-sm text-gray-500">
                  {t("web.provider.settings.pages.team/notifications.chooseHowReceives")}
                </p>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <Switch
                      checked={settings.email_enabled}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, email_enabled: checked })
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {t("web.provider.settings.pages.team/notifications.emailNotifications")}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
{t("web.provider.settings.pages.team/notifications.sendNotificationsToEmail", { email: selectedMemberData?.email || t("web.provider.settings.pages.team/notifications.theirEmailAddress") })}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`flex items-start gap-4 p-4 bg-gray-50 rounded-lg ${!settings.sms_plan_allowed ? "opacity-70" : ""}`}
                  >
                    <Switch
                      checked={settings.sms_plan_allowed ? settings.sms_enabled : false}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, sms_enabled: checked })
                      }
                      disabled={!settings.sms_plan_allowed}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {t("web.provider.settings.pages.team/notifications.smsNotifications")}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        {settings.sms_plan_allowed
                          ? t("web.provider.settings.pages.team/notifications.sendSmsToMobile", { mobile: selectedMemberData?.mobile || t("web.provider.settings.pages.team/notifications.theirMobileNumber") })
                          : getUpgradeMessage("staff.sms")}
                      </p>
                      {!settings.sms_plan_allowed ? (
                        <Link
                          href="/provider/subscription"
                          className="inline-block mt-2 text-xs font-medium text-primary underline"
                        >
                          {t("web.provider.settings.pages.team/notifications.viewPlans")}
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <Switch
                      checked={settings.desktop_enabled}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, desktop_enabled: checked })
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                        <Monitor className="w-4 h-4" />
                        {t("web.provider.settings.pages.team/notifications.desktopNotifications")}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        {t("web.provider.settings.pages.team/notifications.desktopNotificationsHint")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Notification Types */}
          {selectedMember && (
            <SectionCard>
              <div className="space-y-4">
                <h3 className="text-sm sm:text-base font-semibold">{t("web.provider.settings.pages.team/notifications.whatToNotifyAbout")}</h3>
                <p className="text-xs sm:text-sm text-gray-500">
                  {t("web.provider.settings.pages.team/notifications.chooseWhichEvents")}
                </p>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <Switch
                      checked={settings.appointment_reminders}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, appointment_reminders: checked })
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                        <Bell className="w-4 h-4" />
                        {t("web.provider.settings.pages.team/notifications.appointmentReminders")}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        {t("web.provider.settings.pages.team/notifications.receiveRemindersBefore")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <Switch
                      checked={settings.appointment_cancellations}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, appointment_cancellations: checked })
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {t("web.provider.settings.pages.team/notifications.appointmentCancellations")}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        {t("web.provider.settings.pages.team/notifications.notifiedWhenCancelled")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <Switch
                      checked={settings.appointment_reschedules}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, appointment_reschedules: checked })
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {t("web.provider.settings.pages.team/notifications.appointmentReschedules")}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        {t("web.provider.settings.pages.team/notifications.notifiedWhenRescheduled")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <Switch
                      checked={settings.new_bookings}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, new_bookings: checked })
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                        <User className="w-4 h-4" />
                        {t("web.provider.settings.pages.team/notifications.newBookings")}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        {t("web.provider.settings.pages.team/notifications.notifiedWhenBookedForYou")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <Switch
                      checked={settings.daily_schedule}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, daily_schedule: checked })
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {t("web.provider.settings.pages.team/notifications.dailySchedule")}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        {t("web.provider.settings.pages.team/notifications.receiveDailySummary")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <Switch
                      checked={settings.weekly_schedule}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, weekly_schedule: checked })
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {t("web.provider.settings.pages.team/notifications.weeklySchedule")}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        {t("web.provider.settings.pages.team/notifications.receiveWeeklySummary")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Reminder Timing */}
          {selectedMember && settings.appointment_reminders && (
            <SectionCard>
              <div className="space-y-4">
                <h3 className="text-sm sm:text-base font-semibold">{t("web.provider.settings.pages.team/notifications.reminderTiming")}</h3>
                <p className="text-xs sm:text-sm text-gray-500">
                  {t("web.provider.settings.pages.team/notifications.whenToSendReminders")}
                </p>

                <Separator />

                <div>
                  <Label htmlFor="reminder_time" className="text-sm font-medium">
                    {t("web.provider.settings.pages.team/notifications.reminderTime")}
                  </Label>
                  <Select
                    value={settings.reminder_time}
                    onValueChange={(value) =>
                      setSettings({ ...settings, reminder_time: value })
                    }
                  >
                    <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="48h">{t("web.provider.settings.pages.team/notifications.hoursBefore", { count: 48 })}</SelectItem>
                      <SelectItem value="24h">{t("web.provider.settings.pages.team/notifications.hoursBefore", { count: 24 })}</SelectItem>
                      <SelectItem value="12h">{t("web.provider.settings.pages.team/notifications.hoursBefore", { count: 12 })}</SelectItem>
                      <SelectItem value="6h">{t("web.provider.settings.pages.team/notifications.hoursBefore", { count: 6 })}</SelectItem>
                      <SelectItem value="2h">{t("web.provider.settings.pages.team/notifications.hoursBefore", { count: 2 })}</SelectItem>
                      <SelectItem value="1h">{t("web.provider.settings.pages.team/notifications.hoursBefore", { count: 1 })}</SelectItem>
                      <SelectItem value="30m">{t("web.provider.settings.pages.team/notifications.minutesBefore", { count: 30 })}</SelectItem>
                      <SelectItem value="15m">{t("web.provider.settings.pages.team/notifications.minutesBefore", { count: 15 })}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {t("web.provider.settings.pages.team/notifications.chooseWhenToSend")}
                  </p>
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </SettingsDetailLayout>
  );
}
