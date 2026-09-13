"use client";

import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
  const title =
    reason === "refunded"
      ? t("provider.mobile.screens.bookingDetail.bookingRefundedTitle")
      : reason === "outstanding"
        ? t("provider.mobile.screens.bookingDetail.outstandingBalanceTitle")
        : t("provider.mobile.screens.bookingDetail.beforeCompletingTitle");

  return (
    <Dialog open={open} onOpenChange={onOpenChange} data-testid="booking-complete-confirm-dialog">
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-start whitespace-pre-wrap pt-1">
            {message}
            {outstandingLabel ? `\n\n${t("web.completeConfirm.balanceDue", { label: outstandingLabel })}` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
          {reason === "refunded" ? (
            <>
              {onCancelBooking ? (
                <BookingActionButton disabled={busy} onClick={onCancelBooking}>
                  {t("provider.mobile.screens.bookingDetail.cancelBookingCta")}
                </BookingActionButton>
              ) : null}
              <BookingActionButton variant="outline" onClick={() => onOpenChange(false)}>
                {t("provider.mobile.screens.bookingDetail.dismissCta")}
              </BookingActionButton>
            </>
          ) : (
            <>
              {onCollectPayment ? (
                <BookingActionButton disabled={busy} onClick={onCollectPayment}>
                  {t("provider.mobile.screens.bookingDetail.collectPaymentCta")}
                </BookingActionButton>
              ) : null}
              <BookingActionButton variant="outline" disabled={busy} onClick={onCompleteAnyway} data-testid="booking-complete-anyway">
                {t("provider.mobile.screens.bookingDetail.completeAnywayCta")}
              </BookingActionButton>
              <BookingActionButton variant="outline" onClick={() => onOpenChange(false)}>
                {t("web.completeConfirm.notYet")}
              </BookingActionButton>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
