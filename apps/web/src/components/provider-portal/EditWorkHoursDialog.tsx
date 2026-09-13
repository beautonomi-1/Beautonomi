"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
  const [workHours, setWorkHours] = useState<WorkHours>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadWorkHours = useCallback(async () => {
    if (!staffMember) return;

    try {
      setIsLoading(true);
      const today = new Date();
      const nextWeek = addDays(today, 7);
      await fetcher.get<{ data: unknown[] }>(
        `/api/provider/time-blocks?staff_id=${staffMember.id}&date_from=${format(today, "yyyy-MM-dd")}&date_to=${format(nextWeek, "yyyy-MM-dd")}`
      );

      const defaultHours: WorkHours = {};
      DAYS.forEach((day) => {
        defaultHours[day.key] = {
          enabled: true,
          start: "09:00",
          end: "17:00",
        };
      });

      setWorkHours(defaultHours);
    } catch (error) {
      console.error("Failed to load work hours:", error);
      const defaultHours: WorkHours = {};
      DAYS.forEach((day) => {
        defaultHours[day.key] = {
          enabled: true,
          start: "09:00",
          end: "17:00",
        };
      });
      setWorkHours(defaultHours);
    } finally {
      setIsLoading(false);
    }
  }, [staffMember]);

  useEffect(() => {
    if (open && staffMember) {
      loadWorkHours();
    }
  }, [open, staffMember, loadWorkHours]);

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
      toast.error(t("web.provider.portal.editWorkHours.enableOneDay"));
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
    toast.success(t("web.provider.portal.editWorkHours.appliedToAll"));
  };

  const handleSave = async () => {
    if (!staffMember) {
      toast.error(t("web.provider.portal.editWorkHours.noStaff"));
      return;
    }

    try {
      setIsSaving(true);
      
      // For now, we'll create time blocks for the next 4 weeks
      // In a real implementation, you might want to create recurring time blocks
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      
      type TimeBlockCreate = { staff_id: string; name: string; date: string; start_time: string; end_time: string; is_active: boolean };
      const timeBlocksToCreate: TimeBlockCreate[] = [];
      
      for (let week = 0; week < 4; week++) {
        DAYS.forEach((day, dayIndex) => {
          const dayHours = workHours[day.key];
          if (dayHours?.enabled) {
            const date = addDays(weekStart, week * 7 + dayIndex);
            timeBlocksToCreate.push({
              staff_id: staffMember.id,
              name: t("web.provider.portal.editWorkHours.workHoursName"),
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

      toast.success(t("web.provider.portal.editWorkHours.success", { name: staffMember.name }));
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Failed to save work hours:", error);
      toast.error(error instanceof Error ? error.message : t("web.provider.portal.editWorkHours.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("web.provider.portal.editWorkHours.title")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>{t("web.provider.portal.editWorkHours.staffMember")}</Label>
            <div className="text-sm text-gray-600 font-medium">
              {staffMember?.name || t("web.provider.portal.editWorkHours.noStaff")}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">{t("web.provider.portal.editWorkHours.weeklySchedule")}</Label>
              <Button variant="outline" size="sm" onClick={handleApplyToAll}>
                {t("web.provider.portal.editWorkHours.applyToAll")}
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
                      {t(`web.provider.portal.editWorkHours.${day.key}`)}
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
                      <span className="text-gray-400">{t("web.provider.portal.editWorkHours.to")}</span>
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
                    <div className="text-sm text-gray-400">{t("web.provider.portal.editWorkHours.dayOff")}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? t("web.provider.portal.editWorkHours.saving") : t("web.provider.portal.editWorkHours.saveWorkHours")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
