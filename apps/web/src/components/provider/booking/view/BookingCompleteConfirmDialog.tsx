"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookingActionButton } from "../ui";

export type BookingCompleteConfirmReason = "checklist" | "outstanding" | "refunded";

interface BookingCompleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: BookingCompleteConfirmReason;
  message: string;
  outstandingLabel?: string;
  onCollectPayment?: () => void;
  onCompleteAnyway: () => void;
  onCancelBooking?: () => void;
  busy?: boolean;
}

export function BookingCompleteConfirmDialog({
  open,
  onOpenChange,
  reason,
  message,
  outstandingLabel,
  onCollectPayment,
  onCompleteAnyway,
  onCancelBooking,
  busy = false,
}: BookingCompleteConfirmDialogProps) {
  const title =
    reason === "refunded"
      ? "Booking refunded"
      : reason === "outstanding"
        ? "Outstanding balance"
        : "Before completing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} data-testid="booking-complete-confirm-dialog">
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-left whitespace-pre-wrap pt-1">
            {message}
            {outstandingLabel ? `\n\nBalance due: ${outstandingLabel}` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
          {reason === "refunded" ? (
            <>
              {onCancelBooking ? (
                <BookingActionButton disabled={busy} onClick={onCancelBooking}>
                  Cancel booking
                </BookingActionButton>
              ) : null}
              <BookingActionButton variant="outline" onClick={() => onOpenChange(false)}>
                Dismiss
              </BookingActionButton>
            </>
          ) : (
            <>
              {onCollectPayment ? (
                <BookingActionButton disabled={busy} onClick={onCollectPayment}>
                  Collect payment
                </BookingActionButton>
              ) : null}
              <BookingActionButton variant="outline" disabled={busy} onClick={onCompleteAnyway} data-testid="booking-complete-anyway">
                Complete anyway
              </BookingActionButton>
              <BookingActionButton variant="outline" onClick={() => onOpenChange(false)}>
                Not yet
              </BookingActionButton>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
