/**
 * Canonical receipt math for booking JSON/PDF surfaces.
 * Shared decomposition of persisted booking columns → receipt totals / balance due.
 */

import {
  computeBookingOutstandingDisplay,
  computePackageAppliedForDisplay,
} from "@/lib/bookings/display-invariants";
import { isPaidBookingPaymentStatus } from "@/lib/payments/booking-payment-status";

export {
  reconcileReceiptTotal,
  assertReceiptInvariant,
  warnIfReceiptTotalDriftsDevOnly,
  type ReceiptInvariantPayload,
} from "@/lib/bookings/display-invariants";

export type BookingPaymentLike = {
  amount?: number | null;
  status?: string | null;
  payment_method?: string | null;
  payment_provider?: string | null;
};

export type AdditionalChargeLike = { status?: string | null; amount?: number | null };

/**
 * Normalized financial slice for a booking receipt (customer + provider routes).
 * `row` is typically a `bookings` row (with joined scalars) cast to a loose record.
 */
export function computeBookingReceiptFinancials(input: {
  row: Record<string, unknown>;
  /** Sum of priced line rows when `bookings.subtotal` is missing or invalid. */
  linesSubtotal: number;
  booking_payments?: BookingPaymentLike[] | null;
  additional_charges?: AdditionalChargeLike[] | null;
}) {
  const b = input.row;
  const storedSubtotal = b.subtotal != null ? Number(b.subtotal) : null;
  const subtotal =
    storedSubtotal != null && !Number.isNaN(storedSubtotal) ? storedSubtotal : input.linesSubtotal;

  const tax = Number(b.tax_amount ?? 0);
  // Use || so platform_fee_amount of 0 falls through to legacy service_fee_amount (customer + provider parity).
  const platformFee = Number(b.platform_fee_amount || b.service_fee_amount || 0);
  const platformFeePercentage =
    b.platform_fee_percentage != null && !Number.isNaN(Number(b.platform_fee_percentage))
      ? Number(b.platform_fee_percentage)
      : Number(b.service_fee_percentage ?? 0);
  const travelFee = Number(b.travel_fee ?? 0);
  const tipAmount = Number(b.tip_amount ?? 0);
  const discount = Number(b.discount_amount ?? 0);
  const promotionDiscount = Number(b.promotion_discount_amount ?? 0);
  const membershipDiscount = Number(b.membership_discount_amount ?? 0);
  const loyaltyDiscount = Number(b.loyalty_discount_amount ?? 0);
  const loyaltyPointsUsed = Number(b.loyalty_points_used ?? b.loyalty_points_redeemed ?? 0);
  const cancellationFee = Number(b.cancellation_fee ?? 0);

  const rawPkgId = typeof b.package_id === "string" ? b.package_id : null;
  const entitlementIdRaw = b.customer_package_entitlement_id;
  const packageActuallyApplied = computePackageAppliedForDisplay({
    package_id: rawPkgId,
    customer_package_entitlement_id: typeof entitlementIdRaw === "string" ? entitlementIdRaw : null,
    discount_amount: discount,
    promotion_discount_amount: promotionDiscount,
  });
  const packageDiscount = packageActuallyApplied ? Math.max(0, discount - promotionDiscount) : 0;
  const discountTotal = discount + promotionDiscount + membershipDiscount + loyaltyDiscount;

  const totalFromRow =
    b.total_amount != null && !Number.isNaN(Number(b.total_amount))
      ? Number(b.total_amount)
      : subtotal + tax + platformFee + travelFee + tipAmount - discountTotal - cancellationFee;

  const completedPayments = (input.booking_payments || []).filter((p) => isPaidBookingPaymentStatus(p.status));
  const paymentsPaid = completedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const walletGiftPaymentsPaid = completedPayments
    .filter((p) => {
      const method = String(p.payment_method || "").toLowerCase();
      const provider = String(p.payment_provider || "").toLowerCase();
      return method === "wallet" || method === "gift_card" || provider === "wallet" || provider === "gift_card";
    })
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const walletCredit = Number(b.wallet_amount ?? 0);
  const giftCardCredit = Number(b.gift_card_amount ?? 0);
  const totalPaidRow = Number(b.total_paid ?? 0);
  const totalRefundedRow = Number(b.total_refunded ?? 0);
  const walletGiftCoverage = Math.max(0, walletCredit + giftCardCredit);
  const legacyWalletGiftRemainder = Math.max(0, walletGiftCoverage - walletGiftPaymentsPaid);
  const amountPaid =
    totalPaidRow > 0
      ? Math.max(totalPaidRow, paymentsPaid, walletGiftCoverage)
      : Math.max(totalPaidRow, paymentsPaid + legacyWalletGiftRemainder, walletGiftCoverage);

  const unpaidAdditionalCharges = (input.additional_charges || [])
    .filter((ac) => ac.status !== "paid" && ac.status !== "rejected")
    .reduce((sum, ac) => sum + Number(ac.amount || 0), 0);

  const balanceDue = computeBookingOutstandingDisplay({
    totalAmount: totalFromRow,
    totalPaid: amountPaid,
    totalRefunded: totalRefundedRow,
    walletAmount: walletCredit,
    giftCardAmount: giftCardCredit,
    unpaidAdditionalCharges,
    paymentStatus: typeof b.payment_status === "string" ? b.payment_status : null,
  });

  return {
    subtotal,
    tax,
    platformFee,
    platformFeePercentage,
    travelFee,
    tipAmount,
    discount,
    promotionDiscount,
    membershipDiscount,
    loyaltyDiscount,
    loyaltyPointsUsed,
    rawPkgId,
    packageActuallyApplied,
    packageDiscount,
    discountTotal,
    cancellationFee,
    totalFromRow,
    amountPaid,
    walletCredit,
    giftCardCredit,
    totalPaidRow,
    totalRefundedRow,
    balanceDue,
  };
}
