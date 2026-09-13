"use client";
import { useTranslation } from "@beautonomi/i18n";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Repeat } from "lucide-react";
import type { Shift, TeamMember } from "@/lib/provider-portal/types";

export interface ShiftFormData {
  teamMemberId: string;
  date: string;
  startTime: string;
  endTime: string;
  isRepeating: boolean;
  repeatPattern: string;
  repeatEndDate: string;
  repeatEndsAfter: string;
  isAlternating: boolean;
  alternatingWeek: string;
}

interface ShiftCreateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift?: Shift | null;
  member?: TeamMember | null;
  date?: string;
  members: TeamMember[];
  onSave: (formData: ShiftFormData) => Promise<void>;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ShiftCreateEditDialog({
  open,
  onOpenChange,
  shift,
  member,
  date,
  members,
  onSave,
}: ShiftCreateEditDialogProps) {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<ShiftFormData>({
    teamMemberId: "",
    date: "",
    startTime: "09:00",
    endTime: "17:00",
    isRepeating: false,
    repeatPattern: "weekly",
    repeatEndDate: "",
    repeatEndsAfter: "",
    isAlternating: false,
    alternatingWeek: "week1",
  });

  const isScheduleOverride = shift?.source === "schedule";
  const isLocationOverride = shift?.source === "location";
  const isInheritedOverride = isScheduleOverride || isLocationOverride;

  useEffect(() => {
    queueMicrotask(() => {
      if (shift && !isInheritedOverride) {
        const recurringPattern = shift.recurring_pattern || {};
        const isRepeating = shift.is_recurring || false;
        const isAlternating = recurringPattern.type === "alternating" || false;
        setFormData({
          teamMemberId: shift.team_member_id,
          date: shift.date,
          startTime: shift.start_time,
          endTime: shift.end_time,
          isRepeating: isRepeating,
          repeatPattern: (recurringPattern.pattern as string) || "weekly",
          repeatEndDate: String(recurringPattern.end_date ?? ""),
          repeatEndsAfter: String(recurringPattern.ends_after ?? ""),
          isAlternating: isAlternating,
          alternatingWeek: ((recurringPattern.alternating_week as string) || "week1"),
        });
      } else {
        setFormData({
          teamMemberId: shift?.team_member_id || member?.id || "",
          date: shift?.date || date || formatLocalDate(new Date()),
          startTime: shift?.start_time || "09:00",
          endTime: shift?.end_time || "17:00",
          isRepeating: false,
          repeatPattern: "weekly",
          repeatEndDate: "",
          repeatEndsAfter: "",
          isAlternating: false,
          alternatingWeek: "week1",
        });
      }
    });
  }, [shift, member, date, open, isInheritedOverride]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.teamMemberId || !formData.date) return;
    setIsSaving(true);
    try {
      await onSave(formData);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg font-semibold">
            {isLocationOverride
              ? t("web.provider.pages.team/shifts/dialog.overrideLocation")
              : isScheduleOverride
              ? t("web.provider.pages.team/shifts/dialog.overrideWeekly")
              : shift
              ? t("web.provider.pages.team/shifts/dialog.editShift")
              : t("web.provider.pages.team/shifts/dialog.addShift")}
          </DialogTitle>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {isLocationOverride
              ? t("web.provider.pages.team/shifts/dialog.overrideLocationHint")
              : isScheduleOverride
              ? t("web.provider.pages.team/shifts/dialog.overrideWeeklyHint")
              : shift
              ? t("web.provider.pages.team/shifts/dialog.editHint")
              : t("web.provider.pages.team/shifts/dialog.createHint")}
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div>
            <Label htmlFor="teamMemberId" className="text-sm sm:text-base">{t("web.provider.pages.team/shifts/dialog.teamMemberRequired")}</Label>
            <Select
              value={formData.teamMemberId}
              onValueChange={(value) => setFormData({ ...formData, teamMemberId: value })}
              required
            >
              <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                <SelectValue placeholder={t("web.provider.portal.groupBookingDialog.selectTeamMember")} />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="date" className="text-sm sm:text-base">{t("web.provider.pages.team/shifts/dialog.dateRequired")}</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
              className="mt-1.5 min-h-[44px] touch-manipulation"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <Label htmlFor="startTime" className="text-sm sm:text-base">{t("web.provider.pages.team/shifts/dialog.startTimeRequired")}</Label>
              <Input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                required
                className="mt-1.5 min-h-[44px] touch-manipulation"
              />
            </div>
            <div>
              <Label htmlFor="endTime" className="text-sm sm:text-base">{t("web.provider.pages.team/shifts/dialog.endTimeRequired")}</Label>
              <Input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                required
                className="mt-1.5 min-h-[44px] touch-manipulation"
              />
            </div>
          </div>

          <Separator />

          {/* Alternating Hours (Bi-weekly) */}
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
              <Switch
                checked={formData.isAlternating}
                onCheckedChange={(checked) => setFormData({
                  ...formData,
                  isAlternating: checked,
                  isRepeating: checked ? true : formData.isRepeating,
                  repeatPattern: checked ? "biweekly" : formData.repeatPattern,
                })}
                className="mt-1"
              />
              <div className="flex-1">
                <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                  <Repeat className="w-4 h-4" />
                  {t("web.provider.pages.team/shifts/dialog.alternating")}
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  {t("web.provider.pages.team/shifts/dialog.alternatingHint")}
                </p>
              </div>
            </div>

            {formData.isAlternating && (
              <div className="ms-0 sm:ms-12 space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <Label htmlFor="alternatingWeek" className="text-sm font-medium">
                    {t("web.provider.pages.team/shifts/dialog.startingWeek")}
                  </Label>
                  <Select
                    value={formData.alternatingWeek}
                    onValueChange={(value) => setFormData({ ...formData, alternatingWeek: value })}
                  >
                    <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week1">{t("web.provider.pages.team/shifts/dialog.week1")}</SelectItem>
                      <SelectItem value="week2">{t("web.provider.pages.team/shifts/dialog.week2")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {t("web.provider.pages.team/shifts/dialog.weekHint")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Repeating Shift */}
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
              <Switch
                checked={formData.isRepeating}
                onCheckedChange={(checked) => setFormData({
                  ...formData,
                  isRepeating: checked,
                  isAlternating: checked ? formData.isAlternating : false,
                })}
                className="mt-1"
              />
              <div className="flex-1">
                <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                  <Repeat className="w-4 h-4" />
                  {t("web.provider.pages.team/shifts/dialog.repeating")}
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  {t("web.provider.pages.team/shifts/dialog.repeatingHint")}
                </p>
              </div>
            </div>

            {formData.isRepeating && (
              <div className="ms-0 sm:ms-12 space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <Label htmlFor="repeatPattern" className="text-sm font-medium">
                    {t("web.provider.pages.team/shifts/dialog.repeatPattern")}
                  </Label>
                  <Select
                    value={formData.repeatPattern}
                    onValueChange={(value) => setFormData({ ...formData, repeatPattern: value })}
                    disabled={formData.isAlternating}
                  >
                    <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">{t("web.provider.pages.team/shifts/dialog.daily")}</SelectItem>
                      <SelectItem value="weekly">{t("web.provider.pages.team/shifts/dialog.weekly")}</SelectItem>
                      <SelectItem value="biweekly">{t("web.provider.pages.team/shifts/dialog.biweekly")}</SelectItem>
                      <SelectItem value="monthly">{t("web.provider.pages.team/shifts/dialog.monthly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-2 block">{t("web.provider.pages.team/shifts/dialog.repeatEnds")}</Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="repeatNever"
                        name="repeatEnds"
                        checked={!formData.repeatEndDate && !formData.repeatEndsAfter}
                        onChange={() => setFormData({ ...formData, repeatEndDate: "", repeatEndsAfter: "" })}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="repeatNever" className="text-sm cursor-pointer">
                        {t("web.provider.common.never")}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="repeatEndDate"
                        name="repeatEnds"
                        checked={!!formData.repeatEndDate}
                        onChange={() => setFormData({ ...formData, repeatEndDate: formatLocalDate(new Date()), repeatEndsAfter: "" })}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="repeatEndDate" className="text-sm cursor-pointer">
                        {t("web.provider.pages.team/shifts/dialog.onDate")}
                      </Label>
                      {formData.repeatEndDate && (
                        <Input
                          type="date"
                          value={formData.repeatEndDate}
                          onChange={(e) => setFormData({ ...formData, repeatEndDate: e.target.value })}
                          className="ms-2 flex-1 min-h-[44px] touch-manipulation"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="repeatEndsAfter"
                        name="repeatEnds"
                        checked={!!formData.repeatEndsAfter}
                        onChange={() => setFormData({ ...formData, repeatEndsAfter: "10", repeatEndDate: "" })}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="repeatEndsAfter" className="text-sm cursor-pointer">
                        {t("web.provider.pages.team/shifts/dialog.after")}
                      </Label>
                      {formData.repeatEndsAfter && (
                        <div className="ms-2 flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={formData.repeatEndsAfter}
                            onChange={(e) => setFormData({ ...formData, repeatEndsAfter: e.target.value })}
                            className="w-20 min-h-[44px] touch-manipulation"
                          />
                          <span className="text-sm text-gray-600">{t("web.provider.pages.team/shifts/dialog.occurrences")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              {t("web.provider.common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
            >
              {isSaving
                ? t("web.provider.common.saving")
                : isInheritedOverride
                ? t("web.provider.pages.team/shifts/dialog.createOverride")
                : shift
                ? t("web.provider.pages.team/shifts/dialog.updateShift")
                : t("web.provider.pages.team/shifts/dialog.createShift")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
