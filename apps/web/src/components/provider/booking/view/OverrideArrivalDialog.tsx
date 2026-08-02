"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BookingActionButton } from "../ui";

interface OverrideArrivalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  onConfirm: (reasonText: string) => void;
}

export function OverrideArrivalDialog({
  open,
  onOpenChange,
  saving = false,
  onConfirm,
}: OverrideArrivalDialogProps) {
  const [reason, setReason] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason("");
    onOpenChange(next);
  };

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manual arrival verification</DialogTitle>
          <DialogDescription>
            Customer can&apos;t verify — briefly describe why (required for audit).
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer phone battery dead, verified identity in person"
          rows={4}
          className="rounded-xl min-h-[88px]"
          autoFocus
        />
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <BookingActionButton
            disabled={saving || !reason.trim()}
            onClick={handleConfirm}
          >
            {saving ? "Saving…" : "Verify manually"}
          </BookingActionButton>
          <BookingActionButton
            variant="outline"
            disabled={saving}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </BookingActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
