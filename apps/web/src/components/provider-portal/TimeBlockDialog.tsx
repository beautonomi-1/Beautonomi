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

interface TimeBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block?: TimeBlock | null;
  blockedTimeTypes: BlockedTimeType[];
  onSuccess?: () => void;
}

export function TimeBlockDialog({
  open,
  onOpenChange,
  block,
  blockedTimeTypes,
  onSuccess,
}: TimeBlockDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
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
        setFormData({
          name: block.name,
          description: block.description || "",
          team_member_id: block.team_member_id || "",
          date: block.date,
          start_time: block.start_time,
          end_time: block.end_time,
          is_recurring: block.is_recurring,
          blocked_time_type_id: block.blocked_time_type_id || "",
          recurrence_pattern: block.recurrence_rule?.pattern || "weekly",
          recurrence_end_date: block.recurrence_rule?.end_date || "",
          recurrence_occurrences: block.recurrence_rule?.occurrences,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const blockData: Partial<TimeBlock> = {
        name: formData.name,
        description: formData.description,
        team_member_id: formData.team_member_id || undefined,
        team_member_name: teamMembers.find((m) => m.id === formData.team_member_id)?.name,
        date: formData.date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        is_recurring: formData.is_recurring,
        blocked_time_type_id: formData.blocked_time_type_id || undefined,
        blocked_time_type_name: blockedTimeTypes.find((t) => t.id === formData.blocked_time_type_id)?.name,
        recurrence_rule: formData.is_recurring
          ? {
              pattern: formData.recurrence_pattern as any,
              interval: formData.recurrence_pattern === "biweekly" ? 2 : 1,
              end_date: formData.recurrence_end_date || undefined,
              occurrences: formData.recurrence_occurrences,
            }
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
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Lunch Break, Training Session"
              required
            />
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
                value={formData.team_member_id}
                onValueChange={(value) => setFormData({ ...formData, team_member_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All team members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All team members</SelectItem>
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
                value={formData.blocked_time_type_id}
                onValueChange={(value) => setFormData({ ...formData, blocked_time_type_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {blockedTimeTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
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
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              {isLoading ? "Saving..." : block ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}