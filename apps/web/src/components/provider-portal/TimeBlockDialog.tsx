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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { TimeBlock, BlockedTimeType, TeamMember, RecurrencePattern } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { RADIX_SELECT_ANY, RADIX_SELECT_NONE } from "@/lib/ui/select-radix-sentinels";

interface TimeBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block?: TimeBlock | null;
  blockedTimeTypes: BlockedTimeType[];
  onTypeCreated?: (type: BlockedTimeType) => void;
  onSuccess?: () => void;
}

const QUICK_TYPES = [
  { name: "Lunch Break", color: "#F59E0B" },
  { name: "Team Meeting", color: "#6366F1" },
  { name: "Training", color: "#10B981" },
  { name: "Personal Time", color: "#EC4899" },
  { name: "Admin Time", color: "#64748B" },
];

const QUICK_DURATIONS = [15, 30, 45, 60, 90, 120];

function addMinutesToTime(time: string, minutes: number): string {
  const [h = "0", m = "0"] = time.split(":");
  const total = Math.max(0, Math.min(23 * 60 + 59, Number(h) * 60 + Number(m) + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function TimeBlockDialog({
  open,
  onOpenChange,
  block,
  blockedTimeTypes,
  onTypeCreated,
  onSuccess,
}: TimeBlockDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingType, setIsCreatingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [formData, setFormData] = useState({
    name: block?.name || "",
    description: block?.description || "",
    team_member_id: block?.team_member_id || "",
    date: block?.date || new Date().toISOString().split("T")[0],
    start_time: block?.start_time || "09:00",
    end_time: block?.end_time || "10:00",
    is_recurring: block?.is_recurring || false,
    blocked_time_type_id: block?.blocked_time_type_id || "",
    recurrence_pattern: block?.recurrence_rule?.pattern || "weekly",
    recurrence_end_date: block?.recurrence_rule?.end_date || "",
    recurrence_occurrences: block?.recurrence_rule?.occurrences || undefined,
  });

  useEffect(() => {
    if (open) {
      loadTeamMembers();
      if (block) {
        const rule = block.recurrence_rule as any;
        const pattern = rule?.pattern || rule?.frequency || "weekly";
        setFormData({
          name: block.name,
          description: block.description || "",
          team_member_id: block.team_member_id || "",
          date: block.date,
          start_time: block.start_time,
          end_time: block.end_time,
          is_recurring: block.is_recurring,
          blocked_time_type_id: block.blocked_time_type_id || "",
          recurrence_pattern: pattern,
          recurrence_end_date: rule?.end_date || "",
          recurrence_occurrences: rule?.occurrences,
        });
      }
    }
  }, [open, block]);

  const loadTeamMembers = async () => {
    try {
      const members = await providerApi.listTeamMembers();
      setTeamMembers(members);
    } catch (error) {
      console.error("Failed to load team members:", error);
    }
  };

  const setDuration = (minutes: number) => {
    setFormData((current) => ({
      ...current,
      end_time: addMinutesToTime(current.start_time, minutes),
    }));
  };

  const handleCreateType = async (name = newTypeName.trim(), color = "#FF0077") => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a type name first");
      return;
    }
    setIsCreatingType(true);
    try {
      const created = await providerApi.createBlockedTimeType({
        name: trimmed,
        color,
        is_active: true,
      });
      onTypeCreated?.(created);
      setFormData((current) => ({
        ...current,
        blocked_time_type_id: created.id,
        name: current.name.trim() ? current.name : created.name,
      }));
      setNewTypeName("");
      toast.success("Blocked time type added");
    } catch (error) {
      console.error("Failed to create blocked time type:", error);
      toast.error("Failed to create blocked time type");
    } finally {
      setIsCreatingType(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (timeToMinutes(formData.end_time) <= timeToMinutes(formData.start_time)) {
      toast.error("End time must be after start time");
      return;
    }
    setIsLoading(true);

    try {
      const anchorDate = formData.date || new Date().toISOString().split("T")[0];
      const dow = new Date(anchorDate + "T12:00:00").getDay();

      const blockData: Partial<TimeBlock> = {
        name: formData.name,
        description: formData.description,
        team_member_id: formData.team_member_id || null as any,
        team_member_name: teamMembers.find((m) => m.id === formData.team_member_id)?.name,
        date: formData.date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        is_recurring: formData.is_recurring,
        blocked_time_type_id: formData.blocked_time_type_id || undefined,
        blocked_time_type_name: blockedTimeTypes.find((t) => t.id === formData.blocked_time_type_id)?.name,
        recurrence_rule: formData.is_recurring
          ? {
              frequency: formData.recurrence_pattern === "biweekly" ? "weekly" : formData.recurrence_pattern,
              days: formData.recurrence_pattern === "weekly" || formData.recurrence_pattern === "biweekly"
                ? [dow]
                : undefined,
              end_date: formData.recurrence_end_date || undefined,
            } as any
          : undefined,
      };

      if (block) {
        await providerApi.updateTimeBlock(block.id, blockData);
        toast.success("Time block updated");
      } else {
        await providerApi.createTimeBlock(blockData);
        toast.success("Time block created");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save time block:", error);
      toast.error("Failed to save time block");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{block ? "Edit Time Block" : "New Time Block"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">What are you blocking? *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Lunch Break, Team Meeting, Personal Time"
              required
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_TYPES.map((type) => (
                <button
                  key={type.name}
                  type="button"
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  onClick={() => {
                    setFormData((current) => ({
                      ...current,
                      name: type.name,
                      blocked_time_type_id:
                        blockedTimeTypes.find((existing) => existing.name.toLowerCase() === type.name.toLowerCase())?.id ||
                        current.blocked_time_type_id,
                    }));
                  }}
                >
                  {type.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="team_member_id">Team Member (Optional)</Label>
              <Select
                value={formData.team_member_id || RADIX_SELECT_ANY}
                onValueChange={(value) =>
                  setFormData({ ...formData, team_member_id: value === RADIX_SELECT_ANY ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All team members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RADIX_SELECT_ANY}>All team members</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="blocked_time_type_id">Blocked Time Type</Label>
              <Select
                value={formData.blocked_time_type_id || RADIX_SELECT_NONE}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    blocked_time_type_id: value === RADIX_SELECT_NONE ? "" : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RADIX_SELECT_NONE}>None</SelectItem>
                  {blockedTimeTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3">
                <Label htmlFor="new_time_type" className="text-xs text-gray-600">
                  Add a new type directly
                </Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    id="new_time_type"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="e.g. Stock Take"
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    disabled={isCreatingType}
                    onClick={() => handleCreateType()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="start_time">Start Time *</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="end_time">End Time *</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Duration shortcut</p>
                <p className="text-xs text-gray-500">Pick a length and we will set the end time from the start time.</p>
              </div>
              <p className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
                {Math.max(0, timeToMinutes(formData.end_time) - timeToMinutes(formData.start_time))} min
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_DURATIONS.map((minutes) => (
                <Button
                  key={minutes}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setDuration(minutes)}
                >
                  {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_recurring"
              checked={formData.is_recurring}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_recurring: !!checked })
              }
            />
            <Label htmlFor="is_recurring" className="cursor-pointer">
              Recurring time block
            </Label>
          </div>

          {formData.is_recurring && (
            <div className="space-y-4 pl-6 border-l-2">
              <div>
                <Label htmlFor="recurrence_pattern">Recurrence Pattern</Label>
                <Select
                  value={formData.recurrence_pattern}
                  onValueChange={(value) =>
                    setFormData({ ...formData, recurrence_pattern: value as RecurrencePattern })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="recurrence_end_date">End Date (Optional)</Label>
                  <Input
                    id="recurrence_end_date"
                    type="date"
                    value={formData.recurrence_end_date}
                    onChange={(e) =>
                      setFormData({ ...formData, recurrence_end_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="recurrence_occurrences">Number of Occurrences</Label>
                  <Input
                    id="recurrence_occurrences"
                    type="number"
                    min={1}
                    value={formData.recurrence_occurrences || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        recurrence_occurrences: parseInt(e.target.value) || undefined,
                      })
                    }
                    placeholder="Leave empty for no limit"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary-hover"
            >
              {isLoading ? "Saving..." : block ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}