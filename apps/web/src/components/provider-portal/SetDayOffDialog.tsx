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
import { fetcher } from "@/lib/http/fetcher";
import type { TeamMember } from "@/lib/provider-portal/types";

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
      toast.error("No staff member selected");
      return;
    }

    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }

    try {
      setIsSaving(true);
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      
      const trimmed = reason.trim();
      await fetcher.post(`/api/provider/staff/${staffMember.id}/days-off`, {
        date: dateStr,
        ...(trimmed ? { reason: trimmed } : {}),
      });

      toast.success(`Day off set for ${staffMember.name}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Failed to set day off:", error);
      toast.error(error instanceof Error ? error.message : "Failed to set day off");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Day Off</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Staff Member</Label>
            <div className="text-sm text-gray-600 font-medium">
              {staffMember?.name || "No staff member selected"}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <p className="text-xs text-muted-foreground">Choose a day on the calendar below.</p>
            <div className="rounded-xl border bg-card p-2 shadow-sm">
              <div className="mb-2 text-sm font-medium tabular-nums">
                {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Pick a date"}
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
            <Label htmlFor="reason">Reason (Optional)</Label>
            <Input
              id="reason"
              placeholder="e.g., Vacation, Sick leave, Personal"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !selectedDate}>
            {isSaving ? "Saving..." : "Set Day Off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
