"use client";

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
import { Bell, Mail, Phone, Monitor, Clock, Calendar, User, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface NotificationSettings {
  email_enabled: boolean;
  sms_enabled: boolean;
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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotificationSettings>({
    email_enabled: true,
    sms_enabled: true,
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
      toast.error("Failed to load team members");
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
        sms_enabled: true,
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
        sms_enabled: settings.sms_enabled,
        desktop_enabled: settings.desktop_enabled,
        appointment_reminders: settings.appointment_reminders,
        appointment_cancellations: settings.appointment_cancellations,
        appointment_reschedules: settings.appointment_reschedules,
        new_bookings: settings.new_bookings,
        daily_schedule: settings.daily_schedule,
        weekly_schedule: settings.weekly_schedule,
        reminder_time: settings.reminder_time,
      });
      toast.success("Notification settings saved successfully");
    } catch (error: any) {
      console.error("Failed to save notification settings:", error);
      toast.error(error.message || "Failed to save notification settings");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedMemberData = teamMembers.find((m) => m.id === selectedMember);

  return (
    <SettingsDetailLayout
      title="Staff Notifications"
      subtitle="Configure how team members receive notifications"
      onSave={handleSave}
      saveLabel={isSaving ? "Saving..." : "Save Settings"}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Team", href: "/provider/settings/team/roles" },
        { label: "Staff Notifications" },
      ]}
    >
      {isLoading ? (
        <SectionCard>
          <Skeleton className="h-64 w-full" />
        </SectionCard>
      ) : teamMembers.length === 0 ? (
        <SectionCard className="p-8 sm:p-12 text-center">
          <p className="text-gray-600 mb-4">No active team members found</p>
          <Button onClick={() => window.location.href = "/provider/team/members"}>
            Add Team Members
          </Button>
        </SectionCard>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Team Member Selector */}
          <SectionCard>
            <div className="space-y-4">
              <div>
                <Label className="text-sm sm:text-base font-semibold mb-2 block">
                  Select Team Member
                </Label>
                <Select value={selectedMember || ""} onValueChange={setSelectedMember}>
                  <SelectTrigger className="min-h-[44px] touch-manipulation">
                    <SelectValue placeholder="Select a team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-xs">
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
                      <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077]">
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
                <h3 className="text-sm sm:text-base font-semibold">Notification Channels</h3>
                <p className="text-xs sm:text-sm text-gray-500">
                  Choose how this team member receives notifications
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
                        Email Notifications
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Send notifications to {selectedMemberData?.email || "their email address"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <Switch
                      checked={settings.sms_enabled}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, sms_enabled: checked })
                      }
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        SMS Notifications
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Send SMS notifications to {selectedMemberData?.mobile || "their mobile number"}
                      </p>
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
                        Desktop Notifications
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Show browser desktop notifications (requires permission)
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
                <h3 className="text-sm sm:text-base font-semibold">What to Notify About</h3>
                <p className="text-xs sm:text-sm text-gray-500">
                  Choose which events trigger notifications
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
                        Appointment Reminders
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Receive reminders before appointments
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
                        Appointment Cancellations
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Get notified when appointments are cancelled
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
                        Appointment Reschedules
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Get notified when appointments are rescheduled
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
                        New Bookings
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Get notified when new appointments are booked for you
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
                        Daily Schedule
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Receive daily schedule summary
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
                        Weekly Schedule
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">
                        Receive weekly schedule summary
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
                <h3 className="text-sm sm:text-base font-semibold">Reminder Timing</h3>
                <p className="text-xs sm:text-sm text-gray-500">
                  When to send appointment reminders
                </p>

                <Separator />

                <div>
                  <Label htmlFor="reminder_time" className="text-sm font-medium">
                    Reminder Time
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
                      <SelectItem value="48h">48 hours before</SelectItem>
                      <SelectItem value="24h">24 hours before</SelectItem>
                      <SelectItem value="12h">12 hours before</SelectItem>
                      <SelectItem value="6h">6 hours before</SelectItem>
                      <SelectItem value="2h">2 hours before</SelectItem>
                      <SelectItem value="1h">1 hour before</SelectItem>
                      <SelectItem value="30m">30 minutes before</SelectItem>
                      <SelectItem value="15m">15 minutes before</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1.5">
                    Choose when to send appointment reminders
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
