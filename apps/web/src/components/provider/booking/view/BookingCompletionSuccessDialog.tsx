"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookingActionButton } from "../ui";

const STORAGE_PREFIX = "provider_booking_completion_modal_seen_";

interface BookingCompletionSuccessDialogProps {
  bookingId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRateClient?: () => void;
  canRate?: boolean;
}

export function BookingCompletionSuccessDialog({
  bookingId,
  clientName,
  open,
  onOpenChange,
  onRateClient,
  canRate = true,
}: BookingCompletionSuccessDialogProps) {
  const dismiss = () => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${bookingId}`, "1");
    } catch {
      /* ignore */
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : dismiss())}>
      <DialogContent className="rounded-2xl max-w-sm text-center">
        <DialogHeader className="items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mb-2">
            <CheckCircle2 className="h-7 w-7 text-green-700" />
          </div>
          <DialogTitle>Service completed</DialogTitle>
          <DialogDescription>
            {clientName ? `${clientName}'s` : "This"} appointment is marked complete.
            {canRate ? " You can rate your client below." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          {canRate && onRateClient ? (
            <BookingActionButton onClick={() => { dismiss(); onRateClient(); }}>
              Rate client
            </BookingActionButton>
          ) : null}
          <BookingActionButton variant="outline" onClick={dismiss}>
            Done
          </BookingActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Returns true when completion success modal should show (once per booking). */
export function useShouldShowCompletionModal(bookingId: string, status: string | undefined): boolean {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!bookingId || status !== "completed") {
      setShouldShow(false);
      return;
    }
    try {
      const seen = localStorage.getItem(`${STORAGE_PREFIX}${bookingId}`);
      setShouldShow(!seen);
    } catch {
      setShouldShow(false);
    }
  }, [bookingId, status]);

  return shouldShow;
}
