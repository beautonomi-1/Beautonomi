import { aggregateGroupChildPaymentRollup } from "@/lib/provider-booking/build-merged-group-row-from-group-detail";

export type GroupPaymentRollupFields = {
  payment_status: string;
  amount_paid: number;
  total_refunded: number;
  balance_due: number;
  tip_amount: number;
  is_invoiced: boolean;
  wallet_gift_coverage: number;
};

function hasInvoicedChildBookings(groupId: string, children: unknown): boolean {
  if (!Array.isArray(children)) return false;
  return (children as Array<{ group_booking_id?: string | null; status?: string | null }>).some(
    (child) =>
      (child?.group_booking_id ?? groupId) === groupId &&
      !["cancelled", "no_show"].includes(String(child?.status ?? "")),
  );
}

/**
 * Single source of truth for group-level payment fields derived from ALL child
 * bookings on group_booking_id (matches merged calendar/list semantics).
 */
export function computeGroupPaymentRollupFields(
  groupId: string,
  children: unknown,
  displayTotal: number,
): GroupPaymentRollupFields {
  const payment = aggregateGroupChildPaymentRollup(groupId, children);
  const invoiced = hasInvoicedChildBookings(groupId, children);
  const resolvedDisplayTotal =
    payment.totalAmount > 0 ? Math.max(displayTotal, payment.totalAmount) : displayTotal;
  const balanceDue = Math.max(
    0,
    payment.totalAmount > 0 ? payment.balanceDue : resolvedDisplayTotal - payment.coverage,
  );

  let paymentStatus: string;
  if (!invoiced) {
    paymentStatus = "not_invoiced";
  } else if (
    payment.hasRefundStatus &&
    payment.totalPaid > 0 &&
    payment.totalRefunded >= payment.totalPaid - 0.01
  ) {
    paymentStatus = "refunded";
  } else if (payment.hasRefundStatus) {
    paymentStatus = "partially_refunded";
  } else if (resolvedDisplayTotal > 0 && balanceDue <= 0) {
    paymentStatus = "paid";
  } else if (payment.totalPaid > 0 || payment.walletGiftCoverage > 0) {
    paymentStatus = "partially_paid";
  } else {
    paymentStatus = "pending";
  }

  return {
    payment_status: paymentStatus,
    amount_paid: payment.totalPaid,
    total_refunded: payment.totalRefunded,
    balance_due: balanceDue,
    tip_amount: payment.tipAmount,
    is_invoiced: invoiced,
    wallet_gift_coverage: payment.walletGiftCoverage,
  };
}
