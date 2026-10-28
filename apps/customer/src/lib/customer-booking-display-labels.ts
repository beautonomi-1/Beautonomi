import type { BookingPaymentDisplay } from "@beautonomi/utils";
import { getBookingPaymentDisplay } from "@beautonomi/utils";

export type BookingDetailTranslate = (
  key: string,
  opts?: Record<string, string | number>,
) => string;

export function bookingPaymentStatusLabel(status: string, td: BookingDetailTranslate): string {
  const s = status.toLowerCase();
  switch (s) {
    case "paid":
      return td("paymentPaidInFull");
    case "partially_paid":
      return td("paymentPartiallyPaid");
    case "pending":
      return td("paymentStatusPending");
    case "refunded":
      return td("paymentStatusRefunded");
    case "partially_refunded":
      return td("paymentStatusPartiallyRefunded");
    case "failed":
    case "payment_failed":
    case "declined":
      return td("paymentFailedLabel");
    case "unpaid":
      return td("paymentStatusUnpaid");
    default:
      return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/** Localized payment chip / append label; mirrors getBookingPaymentDisplay flags. */
export function customerPaymentDisplayLabel(
  input: {
    paymentStatus?: string | null;
    paymentProvider?: string | null;
    outstandingBalance?: number | null;
    paymentOption?: string | null;
    depositRequired?: boolean | null;
  },
  td: BookingDetailTranslate,
): string {
  const display = getBookingPaymentDisplay(input);
  const paymentStatus = String(input.paymentStatus || "pending").toLowerCase();
  const isCash = String(input.paymentProvider || "").toLowerCase() === "cash";
  const isDeposit = input.depositRequired === true || input.paymentOption === "deposit";

  if (isCash && paymentStatus === "pending") {
    return td("payAtAppointment");
  }
  if (display.isPaymentSettled) {
    return td("paymentPaidInFull");
  }
  if (paymentStatus === "partially_paid" && isDeposit) {
    return td("depositPaid");
  }
  if (paymentStatus === "partially_paid") {
    return td("paymentPartiallyPaid");
  }
  if (paymentStatus === "partially_refunded") {
    return td("paymentStatusPartiallyRefunded");
  }
  if (paymentStatus === "refunded") {
    return td("paymentStatusRefunded");
  }
  if (
    paymentStatus === "failed" ||
    paymentStatus === "payment_failed" ||
    paymentStatus === "declined"
  ) {
    return td("paymentFailedLabel");
  }
  return td("paymentStatusPending");
}

export function customerPaymentDisplayDescription(
  input: Parameters<typeof getBookingPaymentDisplay>[0],
  td: BookingDetailTranslate,
): string {
  const paymentStatus = String(input.paymentStatus || "pending").toLowerCase();
  const isCash = String(input.paymentProvider || "").toLowerCase() === "cash";
  const isDeposit = input.depositRequired === true || input.paymentOption === "deposit";
  const outstanding = Math.max(0, Number(input.outstandingBalance || 0));

  if (isCash && paymentStatus === "pending") {
    return td("lifecyclePayAtAppointmentDescription");
  }
  if (paymentStatus === "paid" || (paymentStatus === "pending" && outstanding <= 0)) {
    return td("lifecyclePaymentReceivedDescription");
  }
  if (paymentStatus === "partially_paid" && isDeposit) {
    return td("lifecycleDepositReceivedDescription");
  }
  if (paymentStatus === "partially_paid") {
    return td("lifecyclePartialPaymentDescription");
  }
  if (paymentStatus === "partially_refunded") {
    return td("lifecyclePartialRefundDescription");
  }
  if (paymentStatus === "refunded") {
    return td("lifecycleRefundedDescription");
  }
  if (
    paymentStatus === "failed" ||
    paymentStatus === "payment_failed" ||
    paymentStatus === "declined"
  ) {
    return td("lifecyclePaymentFailedDescription");
  }
  return td("lifecyclePaymentNotConfirmedDescription");
}

export function customerLifecycleTitle(
  effectiveStatus: string,
  lifecycleHint: string | null | undefined,
  td: BookingDetailTranslate,
): string {
  if (lifecycleHint === "awaiting_close_out") {
    return td("lifecycleAwaitingCloseOutTitle");
  }
  switch (effectiveStatus) {
    case "pending_payment":
      return td("statusPaymentPending");
    case "pending":
      return td("milestoneRequestReceived");
    case "confirmed":
      return td("milestoneBookingConfirmed");
    case "completed":
      return td("statusServiceCompleted");
    case "cancelled":
      return td("statusBookingCancelled");
    case "no_show":
      return td("statusNoShow");
    case "started":
    case "in_progress":
      return td("statusServiceInProgress");
    default:
      return td("lifecycleUpdateTitle");
  }
}

export function customerLifecycleDescription(
  effectiveStatus: string,
  lifecycleHint: string | null | undefined,
  providerName: string,
  td: BookingDetailTranslate,
): string {
  if (lifecycleHint === "awaiting_close_out") {
    return td("lifecycleCloseOutProvider", { name: providerName });
  }
  switch (effectiveStatus) {
    case "pending_payment":
      return td("lifecyclePaymentPendingDescription");
    case "pending":
      return td("lifecycleAwaitingConfirmWithProvider", { name: providerName });
    case "confirmed":
      return td("lifecycleConfirmedWithProvider", { name: providerName });
    case "completed":
      return td("lifecycleCompletedDescription");
    case "cancelled":
      return td("lifecycleCancelledDescription");
    case "no_show":
      return td("lifecycleNoShowDescription");
    case "started":
    case "in_progress":
      return td("lifecycleInProgressDescription");
    default:
      return td("lifecycleBookingUpdateDescription");
  }
}

export function customerStatusPillLabel(
  status: string,
  effectiveStatus: string,
  td: BookingDetailTranslate,
): string {
  switch (status) {
    case "no_show":
      return td("statusNoShow");
    case "in_progress":
    case "started":
      return td("statusServiceInProgress");
    case "checked_in":
      return td("statusCheckedIn");
    case "pending_payment":
      return td("statusPaymentPending");
    case "pending":
      return td("statusAwaitingConfirmation");
    case "confirmed":
      return td("statusPillConfirmed");
    case "completed":
      return td("statusPillCompleted");
    case "cancelled":
      return td("statusPillCancelled");
    case "waiting":
      return td("statusPillWaiting");
    default:
      return customerLifecycleTitle(effectiveStatus, null, td);
  }
}
