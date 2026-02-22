"use client";

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
      toast.error("Failed to load display preferences");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await providerApi.updateCalendarDisplayPreferences(formData);
      toast.success("Display preferences saved");
      loadPreferences();
    } catch (error) {
      console.error("Failed to save preferences:", error);
      toast.error("Failed to save display preferences");
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Calendar", href: "/provider/calendar" },
    { label: "Display Preferences" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Calendar Display Preferences"
        subtitle="Customize how your calendar is displayed"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading display preferences..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Calendar Display Preferences"
      subtitle="Customize how your calendar is displayed"
      onSave={handleSave}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">View Settings</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default_view">Default View</Label>
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
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="3-days">3 Days</SelectItem>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="week_starts_on">Week Starts On</Label>
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
                    <SelectItem value="0">Sunday</SelectItem>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem>
                    <SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Time Settings</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="start_hour">Start Hour</Label>
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
                <Label htmlFor="end_hour">End Hour</Label>
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
                <Label htmlFor="time_slot_interval">Time Slot Interval (minutes)</Label>
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
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Display Options</h3>
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
                Show weekends
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
                Show time labels
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
                Show appointment duration
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
                Show resource assignments
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
                Show waitlist entries
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
                Show time blocks
              </Label>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Appointment Display</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="appointment_height">Appointment Height</Label>
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
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="expanded">Expanded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="color_by">Color By</Label>
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
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="team_member">Team Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}