"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import type { CompletionBlocker } from "@beautonomi/provider-booking";

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

export type CompletionHandoverActionId =
  | "collect_payment"
  | "mark_collected"
  | "manage_delivery"
  | "set_pickup"
  | "set_delivery"
  | "prepare_order"
  | "view_charges";

interface BookingCompleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: BookingCompleteConfirmReason;
  message: string;
  outstandingLabel?: string;
  blockers?: CompletionBlocker[];
  handoverBusy?: boolean;
  onHandoverAction?: (blocker: CompletionBlocker, actionId: CompletionHandoverActionId) => void;
  onCollectPayment?: () => void;
  /** For `outstanding`, receives the required override reason. */
  onCompleteAnyway: (unpaidReason?: string) => void;
  onCancelBooking?: () => void;
  /** Owner or manager; others can't complete with a balance (server rule). */
  canCompleteWithBalance?: boolean;
  busy?: boolean;
}

function actionForBlocker(blocker: CompletionBlocker): CompletionHandoverActionId | null {
  switch (blocker.code) {
    case "outstanding":
      return "collect_payment";
    case "additional_charges":
      return "view_charges";
    case "products_collection":
      return "mark_collected";
    case "products_delivery":
      return "manage_delivery";
    case "products_unspecified":
      return "set_pickup";
    case "products_unprepared":
      return "prepare_order";
    default:
      return null;
  }
}

export function completionHandoverPrimaryAction(
  blocker: CompletionBlocker,
): CompletionHandoverActionId | null {
  return actionForBlocker(blocker);
}

export function BookingCompleteConfirmDialog({
  open,
  onOpenChange,
  reason,
  message,
  outstandingLabel,
  blockers = [],
  handoverBusy = false,
  onHandoverAction,
  onCollectPayment,
  onCompleteAnyway,
  onCancelBooking,
  canCompleteWithBalance = true,
  busy = false,
}: BookingCompleteConfirmDialogProps) {
  const { t } = useTranslation();
  const p = "web.provider.bookings.detail.completion";
  const [unpaidReason, setUnpaidReason] = useState("");
  useEffect(() => {
    if (open) setUnpaidReason("");
  }, [open]);

  const title =
    reason === "refunded" || blockers.some((b) => b.code === "refunded")
      ? t("provider.mobile.screens.bookingDetail.bookingRefundedTitle")
      : reason === "outstanding"
        ? t("provider.mobile.screens.bookingDetail.outstandingBalanceTitle")
        : t("provider.mobile.screens.bookingDetail.beforeCompletingTitle");
  const needsReason =
    reason === "outstanding" || blockers.some((b) => b.code === "outstanding");
  const reasonValid = unpaidReason.trim().length >= 3;
  const showHandover = reason === "checklist" && blockers.length > 0;
  const hasOutstandingBlocker = blockers.some((b) => b.code === "outstanding");
  const refundedBlock = reason === "refunded" || blockers.some((b) => b.code === "refunded");

  const labelForAction = (actionId: CompletionHandoverActionId): string => {
    switch (actionId) {
      case "collect_payment":
        return t(`${p}.collectPayment`);
      case "mark_collected":
        return t(`${p}.markCollected`);
      case "manage_delivery":
        return t(`${p}.manageDelivery`);
      case "set_pickup":
        return t(`${p}.setPickup`);
      case "set_delivery":
        return t(`${p}.setDelivery`);
      case "prepare_order":
        return t(`${p}.prepareOrder`);
      case "view_charges":
        return t(`${p}.viewCharges`);
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} data-testid="booking-complete-confirm-dialog">
      <DialogContent className="rounded-2xl max-w-md max-h-[min(90vh,640px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-start whitespace-pre-wrap pt-1">
            {showHandover ? t(`${p}.handoverIntro`) : message}
            {!showHandover && outstandingLabel
              ? `\n\n${t("web.completeConfirm.balanceDue", { label: outstandingLabel })}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {showHandover ? (
          <ul className="space-y-3 py-1">
            {blockers.map((blocker, idx) => {
              const primary = actionForBlocker(blocker);
              if (!primary) return null;
              const showDeliveryAlt =
                blocker.code === "products_unspecified" && blocker.orderId;
              return (
                <li
                  key={`${blocker.code}-${blocker.orderId ?? idx}`}
                  className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-2"
                >
                  <p className="text-sm text-amber-950">{blocker.label}</p>
                  <div className="flex flex-wrap gap-2">
                    <BookingActionButton
                      size="sm"
                      fullWidth={false}
                      disabled={busy || handoverBusy}
                      onClick={() => {
                        if (blocker.code === "outstanding" && onCollectPayment) {
                          onCollectPayment();
                          return;
                        }
                        onHandoverAction?.(blocker, primary);
                      }}
                    >
                      {labelForAction(primary)}
                    </BookingActionButton>
                    {showDeliveryAlt ? (
                      <BookingActionButton
                        size="sm"
                        fullWidth={false}
                        variant="outline"
                        disabled={busy || handoverBusy}
                        onClick={() => onHandoverAction?.(blocker, "set_delivery")}
                      >
                        {t(`${p}.setDelivery`)}
                      </BookingActionButton>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {needsReason && !refundedBlock && canCompleteWithBalance ? (
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
        {needsReason && !refundedBlock && !canCompleteWithBalance ? (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
            {t("provider.mobile.screens.bookingDetail.unpaidCompleteNotAllowed")}
          </p>
        ) : null}
        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
          {refundedBlock ? (
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
              {!showHandover && onCollectPayment && !hasOutstandingBlocker ? (
                <BookingActionButton disabled={busy} onClick={onCollectPayment}>
                  {t("provider.mobile.screens.bookingDetail.collectPaymentCta")}
                </BookingActionButton>
              ) : null}
              {!needsReason || canCompleteWithBalance ? (
                <BookingActionButton
                  variant="outline"
                  disabled={busy || handoverBusy || (needsReason && !reasonValid)}
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