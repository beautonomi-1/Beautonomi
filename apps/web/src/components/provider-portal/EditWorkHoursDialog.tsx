"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import type { TeamMember } from "@/lib/provider-portal/types";
import { format, addDays, startOfWeek } from "date-fns";

interface WorkHours {
  [key: string]: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

interface EditWorkHoursDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffMember: TeamMember | null;
  onSuccess?: () => void;
}

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

export function EditWorkHoursDialog({
  open,
  onOpenChange,
  staffMember,
  onSuccess,
}: EditWorkHoursDialogProps) {
  const [workHours, setWorkHours] = useState<WorkHours>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load existing time blocks for this staff member
  useEffect(() => {
    if (open && staffMember) {
      loadWorkHours();
    }
  }, [open, staffMember]);

  const loadWorkHours = async () => {
    if (!staffMember) return;

    try {
      setIsLoading(true);
      // Get time blocks for the next 7 days to see current schedule
      const today = new Date();
      const nextWeek = addDays(today, 7);
      
      const _response = await fetcher.get<{ data: any[] }>(
        `/api/provider/time-blocks?staff_id=${staffMember.id}&date_from=${format(today, "yyyy-MM-dd")}&date_to=${format(nextWeek, "yyyy-MM-dd")}`
      );

      // Initialize default hours (9 AM - 5 PM)
      const defaultHours: WorkHours = {};
      DAYS.forEach((day) => {
        defaultHours[day.key] = {
          enabled: day.key !== "sunday", // Sunday disabled by default
          start: "09:00",
          end: "17:00",
        };
      });

      setWorkHours(defaultHours);
    } catch (error) {
      console.error("Failed to load work hours:", error);
      // Set default hours on error
      const defaultHours: WorkHours = {};
      DAYS.forEach((day) => {
        defaultHours[day.key] = {
          enabled: day.key !== "sunday",
          start: "09:00",
          end: "17:00",
        };
      });
      setWorkHours(defaultHours);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDayToggle = (dayKey: string) => {
    setWorkHours((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        enabled: !prev[dayKey]?.enabled,
      },
    }));
  };

  const handleTimeChange = (dayKey: string, field: "start" | "end", value: string) => {
    setWorkHours((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value,
      },
    }));
  };

  const handleApplyToAll = () => {
    const firstEnabledDay = DAYS.find((day) => workHours[day.key]?.enabled);
    if (!firstEnabledDay) {
      toast.error("Please enable at least one day first");
      return;
    }

    const template = workHours[firstEnabledDay.key];
    const updated: WorkHours = {};
    DAYS.forEach((day) => {
      updated[day.key] = {
        enabled: template.enabled,
        start: template.start,
        end: template.end,
      };
    });
    setWorkHours(updated);
    toast.success("Applied to all days");
  };

  const handleSave = async () => {
    if (!staffMember) {
      toast.error("No staff member selected");
      return;
    }

    try {
      setIsSaving(true);
      
      // For now, we'll create time blocks for the next 4 weeks
      // In a real implementation, you might want to create recurring time blocks
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      
      // Create time blocks for each enabled day for the next 4 weeks
      const timeBlocksToCreate: any[] = [];
      
      for (let week = 0; week < 4; week++) {
        DAYS.forEach((day, dayIndex) => {
          const dayHours = workHours[day.key];
          if (dayHours?.enabled) {
            const date = addDays(weekStart, week * 7 + dayIndex);
            timeBlocksToCreate.push({
              staff_id: staffMember.id,
              name: "Work Hours",
              date: format(date, "yyyy-MM-dd"),
              start_time: dayHours.start,
              end_time: dayHours.end,
              is_active: true,
            });
          }
        });
      }

      // Create time blocks (in batches if needed)
      for (const block of timeBlocksToCreate) {
        try {
          await fetcher.post("/api/provider/time-blocks", block);
        } catch (error) {
          console.error("Failed to create time block:", error);
        }
      }

      toast.success(`Work hours updated for ${staffMember.name}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Failed to save work hours:", error);
      toast.error(error?.message || "Failed to save work hours");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Work Hours</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Staff Member</Label>
            <div className="text-sm text-gray-600 font-medium">
              {staffMember?.name || "No staff member selected"}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Weekly Schedule</Label>
              <Button variant="outline" size="sm" onClick={handleApplyToAll}>
                Apply to All Days
              </Button>
            </div>

            {DAYS.map((day) => {
              const dayHours = workHours[day.key] || { enabled: false, start: "09:00", end: "17:00" };
              return (
                <div key={day.key} className="flex items-center gap-4 p-3 border rounded-lg">
                  <div className="flex items-center space-x-2 min-w-[120px]">
                    <Checkbox
                      id={day.key}
                      checked={dayHours.enabled}
                      onCheckedChange={() => handleDayToggle(day.key)}
                    />
                    <Label htmlFor={day.key} className="font-medium cursor-pointer">
                      {day.label}
                    </Label>
                  </div>

                  {dayHours.enabled && (
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <Input
                          type="time"
                          value={dayHours.start}
                          onChange={(e) => handleTimeChange(day.key, "start", e.target.value)}
                          className="w-32"
                          disabled={!dayHours.enabled}
                        />
                      </div>
                      <span className="text-gray-400">to</span>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <Input
                          type="time"
                          value={dayHours.end}
                          onChange={(e) => handleTimeChange(day.key, "end", e.target.value)}
                          className="w-32"
                          disabled={!dayHours.enabled}
                        />
                      </div>
                    </div>
                  )}

                  {!dayHours.enabled && (
                    <div className="text-sm text-gray-400">Day off</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? "Saving..." : "Save Work Hours"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
