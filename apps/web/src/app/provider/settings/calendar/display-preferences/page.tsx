"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { CalendarDisplayPreferences } from "@/lib/provider-portal/types";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionCard } from "@/components/provider/SectionCard";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { toast } from "sonner";

export default function CalendarDisplayPreferencesPage() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [_isSaving, setIsSaving] = useState(false);
  const [_preferences, setPreferences] = useState<CalendarDisplayPreferences | null>(null);

  const [formData, setFormData] = useState({
    week_starts_on: 1 as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    start_hour: 8,
    end_hour: 20,
    time_slot_interval: 30,
    show_weekends: true,
    show_time_labels: true,
    show_duration: true,
    default_view: "week" as "day" | "3-days" | "week" | "month",
    appointment_height: "normal" as "compact" | "normal" | "expanded",
    color_by: "service" as "service" | "status" | "team_member",
    show_resource_assignments: true,
    show_waitlist_entries: false,
    show_time_blocks: true,
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.getCalendarDisplayPreferences();
      setPreferences(data);
      setFormData({
        week_starts_on: data.week_starts_on,
        start_hour: data.start_hour,
        end_hour: data.end_hour,
        time_slot_interval: data.time_slot_interval,
        show_weekends: data.show_weekends,
        show_time_labels: data.show_time_labels,
        show_duration: data.show_duration,
        default_view: data.default_view,
        appointment_height: data.appointment_height,
        color_by: data.color_by,
        show_resource_assignments: data.show_resource_assignments,
        show_waitlist_entries: data.show_waitlist_entries,
        show_time_blocks: data.show_time_blocks,
      });
    } catch (error) {
      console.error("Failed to load preferences:", error);
      toast.error(t("web.provider.settings.pages.calendar/display-preferences.failedToLoadDisplayPreferences"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await providerApi.updateCalendarDisplayPreferences(formData);
      toast.success(t("web.provider.settings.pages.calendar/display-preferences.displayPreferencesSaved"));
      loadPreferences();
    } catch (error) {
      console.error("Failed to save preferences:", error);
      toast.error(t("web.provider.settings.pages.calendar/display-preferences.failedToSaveDisplayPreferences"));
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.calendar/display-preferences.calendar"), href: "/provider/calendar" },
    { label: t("web.provider.settings.pages.calendar/display-preferences.displayPreferences") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.calendarDisplay.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.calendarDisplay.description")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.calendar/display-preferences.loadingDisplayPreferences")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.appointmentActivity.items.calendarDisplay.title")}
      subtitle={t("web.provider.settings.categories.appointmentActivity.items.calendarDisplay.description")}
      onSave={handleSave}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">{t("web.provider.settings.pages.calendar/display-preferences.viewSettings")}</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default_view">{t("web.provider.settings.pages.calendar/display-preferences.defaultView")}</Label>
                <Select
                  value={formData.default_view}
                  onValueChange={(value) =>
                    setFormData({ ...formData, default_view: value as any })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">{t("web.provider.settings.pages.calendar/display-preferences.day")}</SelectItem>
                    <SelectItem value="3-days">{t("web.provider.settings.pages.calendar/display-preferences.threeDays")}</SelectItem>
                    <SelectItem value="week">{t("web.provider.settings.pages.calendar/display-preferences.week")}</SelectItem>
                    <SelectItem value="month">{t("web.provider.settings.pages.calendar/display-preferences.month")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="week_starts_on">{t("web.provider.settings.pages.calendar/display-preferences.weekStartsOn")}</Label>
                <Select
                  value={formData.week_starts_on.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, week_starts_on: parseInt(value) as any })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("web.provider.common.weekday.sunday")}</SelectItem>
                    <SelectItem value="1">{t("web.provider.common.weekday.monday")}</SelectItem>
                    <SelectItem value="2">{t("web.provider.common.weekday.tuesday")}</SelectItem>
                    <SelectItem value="3">{t("web.provider.common.weekday.wednesday")}</SelectItem>
                    <SelectItem value="4">{t("web.provider.common.weekday.thursday")}</SelectItem>
                    <SelectItem value="5">{t("web.provider.common.weekday.friday")}</SelectItem>
                    <SelectItem value="6">{t("web.provider.common.weekday.saturday")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">{t("web.provider.settings.pages.calendar/display-preferences.timeSettings")}</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="start_hour">{t("web.provider.settings.pages.calendar/display-preferences.startHour")}</Label>
                <Input
                  id="start_hour"
                  type="number"
                  min={0}
                  max={23}
                  value={formData.start_hour}
                  onChange={(e) =>
                    setFormData({ ...formData, start_hour: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label htmlFor="end_hour">{t("web.provider.settings.pages.calendar/display-preferences.endHour")}</Label>
                <Input
                  id="end_hour"
                  type="number"
                  min={0}
                  max={23}
                  value={formData.end_hour}
                  onChange={(e) =>
                    setFormData({ ...formData, end_hour: parseInt(e.target.value) || 23 })
                  }
                />
              </div>
              <div>
                <Label htmlFor="time_slot_interval">{t("web.provider.settings.pages.calendar/display-preferences.timeSlotInterval")}</Label>
                <Select
                  value={formData.time_slot_interval.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, time_slot_interval: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">{t("web.provider.settings.pages.calendar/display-preferences.minutes15")}</SelectItem>
                    <SelectItem value="30">{t("web.provider.settings.pages.calendar/display-preferences.minutes30")}</SelectItem>
                    <SelectItem value="60">{t("web.provider.settings.pages.calendar/display-preferences.minutes60")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">{t("web.provider.settings.pages.calendar/display-preferences.displayOptions")}</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="show_weekends"
                checked={formData.show_weekends}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, show_weekends: !!checked })
                }
              />
              <Label htmlFor="show_weekends" className="cursor-pointer">
                {t("web.provider.settings.pages.calendar/display-preferences.showWeekends")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show_time_labels"
                checked={formData.show_time_labels}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, show_time_labels: !!checked })
                }
              />
              <Label htmlFor="show_time_labels" className="cursor-pointer">
                {t("web.provider.settings.pages.calendar/display-preferences.showTimeLabels")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show_duration"
                checked={formData.show_duration}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, show_duration: !!checked })
                }
              />
              <Label htmlFor="show_duration" className="cursor-pointer">
                {t("web.provider.settings.pages.calendar/display-preferences.showDuration")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show_resource_assignments"
                checked={formData.show_resource_assignments}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, show_resource_assignments: !!checked })
                }
              />
              <Label htmlFor="show_resource_assignments" className="cursor-pointer">
                {t("web.provider.settings.pages.calendar/display-preferences.showResourceAssignments")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show_waitlist_entries"
                checked={formData.show_waitlist_entries}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, show_waitlist_entries: !!checked })
                }
              />
              <Label htmlFor="show_waitlist_entries" className="cursor-pointer">
                {t("web.provider.settings.pages.calendar/display-preferences.showWaitlistEntries")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show_time_blocks"
                checked={formData.show_time_blocks}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, show_time_blocks: !!checked })
                }
              />
              <Label htmlFor="show_time_blocks" className="cursor-pointer">
                {t("web.provider.settings.pages.calendar/display-preferences.showTimeBlocks")}
              </Label>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">{t("web.provider.settings.pages.calendar/display-preferences.appointmentDisplay")}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="appointment_height">{t("web.provider.settings.pages.calendar/display-preferences.appointmentHeight")}</Label>
              <Select
                value={formData.appointment_height}
                onValueChange={(value) =>
                  setFormData({ ...formData, appointment_height: value as any })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">{t("web.provider.settings.pages.calendar/display-preferences.compact")}</SelectItem>
                  <SelectItem value="normal">{t("web.provider.settings.pages.calendar/display-preferences.normal")}</SelectItem>
                  <SelectItem value="expanded">{t("web.provider.settings.pages.calendar/display-preferences.expanded")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="color_by">{t("web.provider.settings.pages.calendar/display-preferences.colorBy")}</Label>
              <Select
                value={formData.color_by}
                onValueChange={(value) =>
                  setFormData({ ...formData, color_by: value as any })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">{t("web.provider.settings.pages.calendar/display-preferences.service")}</SelectItem>
                  <SelectItem value="status">{t("web.provider.settings.pages.calendar/display-preferences.status")}</SelectItem>
                  <SelectItem value="team_member">{t("web.provider.settings.pages.calendar/display-preferences.teamMember")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}