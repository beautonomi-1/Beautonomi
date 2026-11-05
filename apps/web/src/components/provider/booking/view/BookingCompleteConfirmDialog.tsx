"use client";

import { useEffect, useState } from "react";
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
  /** For `outstanding`, receives the required override reason. */
  onCompleteAnyway: (unpaidReason?: string) => void;
  onCancelBooking?: () => void;
  /** Owner or manager; others can't complete with a balance (server rule). */
  canCompleteWithBalance?: boolean;
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
  canCompleteWithBalance = true,
  busy = false,
}: BookingCompleteConfirmDialogProps) {
  const { t } = useTranslation();
  const [unpaidReason, setUnpaidReason] = useState("");
  useEffect(() => {
    if (open) setUnpaidReason("");
  }, [open]);

  const title =
    reason === "refunded"
      ? t("provider.mobile.screens.bookingDetail.bookingRefundedTitle")
      : reason === "outstanding"
        ? t("provider.mobile.screens.bookingDetail.outstandingBalanceTitle")
        : t("provider.mobile.screens.bookingDetail.beforeCompletingTitle");
  const needsReason = reason === "outstanding";
  const reasonValid = unpaidReason.trim().length >= 3;

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
        {needsReason && canCompleteWithBalance ? (
          <div className="space-y-1">
            <label htmlFor="complete-unpaid-reason" className="text-sm font-medium text-gray-800">
              {t("provider.mobile.screens.bookingDetail.unpaidCompleteReasonLabel")}
            </label>
            <textarea
              id="complete-unpaid-reason"
              data-testid="booking-complete-unpaid-reason"
              className="w-full min-h-[80px] rounded-xl border border-gray-200 p-3 text-sm"
              placeholder={t("provider.mobile.screens.bookingDetail.unpaidCompleteReasonPlaceholder")}
              value={unpaidReason}
              maxLength={300}
              onChange={(e) => setUnpaidReason(e.target.value)}
            />
          </div>
        ) : null}
        {needsReason && !canCompleteWithBalance ? (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
            {t("provider.mobile.screens.bookingDetail.unpaidCompleteNotAllowed")}
          </p>
        ) : null}
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
              {!needsReason || canCompleteWithBalance ? (
                <BookingActionButton
                  variant="outline"
                  disabled={busy || (needsReason && !reasonValid)}
                  onClick={() => onCompleteAnyway(needsReason ? unpaidReason.trim() : undefined)}
                  data-testid="booking-complete-anyway"
                >
                  {t("provider.mobile.screens.bookingDetail.completeAnywayCta")}
                </BookingActionButton>
              ) : null}
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
