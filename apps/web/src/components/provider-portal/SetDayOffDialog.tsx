"use client";

import React, { useState } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { format, startOfDay } from "date-fns";
import { toast } from "sonner";
import { providerApi } from "@/lib/provider-portal/api";
import type { TeamMember } from "@/lib/provider-portal/types";
import { useTranslation } from "@beautonomi/i18n";

interface SetDayOffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffMember: TeamMember | null;
  selectedDate?: Date;
  onSuccess?: () => void;
}

export function SetDayOffDialog({
  open,
  onOpenChange,
  staffMember,
  selectedDate: initialDate,
  onSuccess,
}: SetDayOffDialogProps) {
  const { t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate || new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => initialDate || new Date());
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const todayStart = startOfDay(new Date());

  React.useEffect(() => {
    if (open && initialDate) {
      setSelectedDate(initialDate);
      setCalendarMonth(initialDate);
    }
    if (open && !initialDate) {
      const d = new Date();
      setSelectedDate(d);
      setCalendarMonth(d);
    }
    if (!open) {
      setReason("");
    }
  }, [open, initialDate]);

  const handleSave = async () => {
    if (!staffMember) {
      toast.error(t("web.provider.portal.setDayOff.noStaff"));
      return;
    }

    if (!selectedDate) {
      toast.error(t("web.provider.portal.setDayOff.selectDate"));
      return;
    }

    try {
      setIsSaving(true);
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      
      const trimmed = reason.trim();
      await providerApi.setDayOff(staffMember.id, {
        date: dateStr,
        ...(trimmed ? { reason: trimmed } : {}),
      });

      toast.success(t("web.provider.portal.setDayOff.success", { name: staffMember.name }));
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Failed to set day off:", error);
      toast.error(error instanceof Error ? error.message : t("web.provider.portal.setDayOff.failed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("web.provider.portal.setDayOff.title")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>{t("web.provider.portal.setDayOff.staffMember")}</Label>
            <div className="text-sm text-gray-600 font-medium">
              {staffMember?.name || t("web.provider.portal.setDayOff.noStaff")}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("web.provider.portal.setDayOff.date")}</Label>
            <p className="text-xs text-muted-foreground">{t("web.provider.portal.setDayOff.calendarHint")}</p>
            <div className="rounded-xl border bg-card p-2 shadow-sm">
              <div className="mb-2 text-sm font-medium tabular-nums">
                {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : t("web.provider.portal.setDayOff.pickDate")}
              </div>
              <Calendar
                mode="single"
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                selected={selectedDate}
                onSelect={(d) => {
                  setSelectedDate(d);
                  if (d) setCalendarMonth(d);
                }}
                initialFocus
                disabled={(d) => d < todayStart}
                className="mx-auto"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">{t("web.provider.portal.setDayOff.reasonOptional")}</Label>
            <Input
              id="reason"
              placeholder={t("web.provider.portal.setDayOff.reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !selectedDate}>
            {isSaving ? t("web.provider.portal.setDayOff.saving") : t("web.provider.portal.setDayOff.setDayOff")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
