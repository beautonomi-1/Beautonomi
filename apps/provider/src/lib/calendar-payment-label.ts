import type { TFunction } from "@beautonomi/i18n";

export interface BookingPaymentFields {
  payment_status?: string | null;
  total_amount?: number | null;
  total_paid?: number | null;
}

/** Same ordering logic as legacy English labels — used for icons / emphasis without comparing translated strings. */
export function paymentNeedsAttention(booking: BookingPaymentFields): boolean {
  const status = String(booking.payment_status ?? "").toLowerCase();
  const total = Number(booking.total_amount ?? 0);
  const paid = Number(booking.total_paid ?? 0);
  if (status === "paid" || status === "completed") return false;
  if (total > 0 && paid >= total) return false;
  if (paid > 0 && paid < total) return true;
  if (status === "pending" || status === "unpaid") return true;
  if (total > 0) return true;
  return false;
}

export function getCalendarPaymentLabel(booking: BookingPaymentFields, t: TFunction): string | null {
  const status = String(booking.payment_status ?? "").toLowerCase();
  const total = Number(booking.total_amount ?? 0);
  const paid = Number(booking.total_paid ?? 0);
  if (status === "paid" || status === "completed" || (total > 0 && paid >= total)) {
    return t("provider.calendarScreen.paymentChip.paid");
  }
  if (paid > 0 && total > paid) {
    return t("provider.calendarScreen.paymentChip.partPaid");
  }
  if (status === "pending" || status === "unpaid" || total > 0) {
    return t("provider.calendarScreen.paymentChip.paymentDue");
  }
  return null;
}
