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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
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
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (open && initialDate) {
      setSelectedDate(initialDate);
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
      
      await fetcher.post(`/api/provider/staff/${staffMember.id}/days-off`, {
        date: dateStr,
        reason: reason || undefined,
        type: reason || "Day Off",
      });

      toast.success(`Day off set for ${staffMember.name}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Failed to set day off:", error);
      toast.error(error?.message || "Failed to set day off");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
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
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
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
