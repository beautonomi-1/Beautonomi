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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Repeat } from "lucide-react";
import type { Shift, TeamMember } from "@/lib/provider-portal/types";

interface ShiftCreateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift?: Shift | null;
  member?: TeamMember | null;
  date?: string;
  members: TeamMember[];
  onSave: () => void;
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
  const [formData, setFormData] = useState({
    teamMemberId: "",
    date: "",
    startTime: "09:00",
    endTime: "17:00",
    isRepeating: false,
    repeatPattern: "weekly" as "daily" | "weekly" | "biweekly" | "monthly",
    repeatEndDate: "",
    repeatEndsAfter: "",
    isAlternating: false,
    alternatingWeek: "week1" as "week1" | "week2",
  });

  useEffect(() => {
    queueMicrotask(() => {
      if (shift) {
        const recurringPattern = shift.recurring_pattern || {};
        const isRepeating = shift.is_recurring || false;
        const isAlternating = recurringPattern.type === "alternating" || false;
        setFormData({
          teamMemberId: shift.team_member_id,
          date: shift.date,
          startTime: shift.start_time,
          endTime: shift.end_time,
          isRepeating: isRepeating,
          repeatPattern: (recurringPattern.pattern as "daily" | "weekly" | "monthly" | "biweekly") || "weekly",
          repeatEndDate: String(recurringPattern.end_date ?? ""),
          repeatEndsAfter: String(recurringPattern.ends_after ?? ""),
          isAlternating: isAlternating,
          alternatingWeek: ((recurringPattern.alternating_week as string) || "week1") as "week1" | "week2",
        });
      } else {
        setFormData({
          teamMemberId: member?.id || "",
          date: date || new Date().toISOString().split("T")[0],
          startTime: "09:00",
          endTime: "17:00",
          isRepeating: false,
          repeatPattern: "weekly",
          repeatEndDate: "",
          repeatEndsAfter: "",
          isAlternating: false,
          alternatingWeek: "week1",
        });
      }
    });
  }, [shift, member, date, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg font-semibold">
            {shift ? "Edit Shift" : "Add Shift"}
          </DialogTitle>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {shift 
              ? "Update shift details and schedule"
              : "Create a new shift or repeating schedule"}
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div>
            <Label htmlFor="teamMemberId" className="text-sm sm:text-base">Team Member *</Label>
            <Select
              value={formData.teamMemberId}
              onValueChange={(value) => setFormData({ ...formData, teamMemberId: value })}
              required
            >
              <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                <SelectValue placeholder="Select team member" />
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
            <Label htmlFor="date" className="text-sm sm:text-base">Date *</Label>
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
              <Label htmlFor="startTime" className="text-sm sm:text-base">Start Time *</Label>
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
              <Label htmlFor="endTime" className="text-sm sm:text-base">End Time *</Label>
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
                onCheckedChange={(checked) => setFormData({ ...formData, isAlternating: checked })}
                className="mt-1"
              />
              <div className="flex-1">
                <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                  <Repeat className="w-4 h-4" />
                  Alternating Hours (Bi-weekly Schedule)
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  Set up alternating hours that repeat every other week
                </p>
              </div>
            </div>

            {formData.isAlternating && (
              <div className="ml-0 sm:ml-12 space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <Label htmlFor="alternatingWeek" className="text-sm font-medium">
                    Which Week?
                  </Label>
                  <Select
                    value={formData.alternatingWeek}
                    onValueChange={(value: any) => setFormData({ ...formData, alternatingWeek: value })}
                  >
                    <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week1">Week 1</SelectItem>
                      <SelectItem value="week2">Week 2</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1.5">
                    Select which week this schedule applies to. The opposite week will be automatically set as off.
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
                onCheckedChange={(checked) => setFormData({ ...formData, isRepeating: checked })}
                className="mt-1"
              />
              <div className="flex-1">
                <Label className="text-sm sm:text-base font-medium cursor-pointer flex items-center gap-2">
                  <Repeat className="w-4 h-4" />
                  Repeating Shift
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  Create a repeating shift pattern
                </p>
              </div>
            </div>

            {formData.isRepeating && (
              <div className="ml-0 sm:ml-12 space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <Label htmlFor="repeatPattern" className="text-sm font-medium">
                    Repeat Pattern
                  </Label>
                  <Select
                    value={formData.repeatPattern}
                    onValueChange={(value: any) => setFormData({ ...formData, repeatPattern: value })}
                  >
                    <SelectTrigger className="mt-1.5 min-h-[44px] touch-manipulation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly (Every 2 weeks)</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium mb-2 block">Repeat Ends</Label>
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
                        Never
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="repeatEndDate"
                        name="repeatEnds"
                        checked={!!formData.repeatEndDate}
                        onChange={() => setFormData({ ...formData, repeatEndDate: new Date().toISOString().split("T")[0], repeatEndsAfter: "" })}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="repeatEndDate" className="text-sm cursor-pointer">
                        On date
                      </Label>
                      {formData.repeatEndDate && (
                        <Input
                          type="date"
                          value={formData.repeatEndDate}
                          onChange={(e) => setFormData({ ...formData, repeatEndDate: e.target.value })}
                          className="ml-2 flex-1 min-h-[44px] touch-manipulation"
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
                        After
                      </Label>
                      {formData.repeatEndsAfter && (
                        <div className="ml-2 flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={formData.repeatEndsAfter}
                            onChange={(e) => setFormData({ ...formData, repeatEndsAfter: e.target.value })}
                            className="w-20 min-h-[44px] touch-manipulation"
                          />
                          <span className="text-sm text-gray-600">occurrences</span>
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
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
            >
              {shift ? "Update" : "Create"} Shift
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
