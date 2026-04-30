/**
 * Booking financial display invariants (customer + provider + receipt).
 *
 * **Subtotal** — Sum of priced line items before tax, Platform Fee, tip, and travel:
 * services, add-ons, products, minus line-level discounts (coupon/promo/membership/loyalty as stored on the row).
 * Travel fee (`travel_fee`) is **not** part of subtotal; it is an additional line for at-home (and similar).
 *
 * **Total amount** — `total_amount` on `bookings`: subtotal + tax + platform_fee + travel + tip − headline discounts,
 * per DB trigger / create-booking-record. Always use the stored row for authoritative totals.
 *
 * **Outstanding** — For display: max(0, total_amount − amount recognized as paid − wallet − gift card),
 * with additional unpaid charges where applicable. For **cancelled** or **refunded** bookings, show **0** outstanding
 * when nothing is owed (use `payment_status` + `total_refunded` to avoid implying debt after full refund).
 */
export const BOOKING_FINANCIAL_INVARIANTS_DOC = "display-invariants.ts";

/** Default IANA zone when provider/location has no timezone (SA marketplace default). */
export const DEFAULT_BOOKING_DISPLAY_TIMEZONE = "Africa/Johannesburg";

export type BookingOutstandingInputs = {
  totalAmount: number;
  totalPaid: number;
  totalRefunded: number;
  walletAmount: number;
  giftCardAmount: number;
  unpaidAdditionalCharges: number;
  paymentStatus?: string | null;
};

/**
 * Amount still owed for a booking, for UI (never negative; refunds reduce effective paid).
 * Aligns customer + provider + receipt “balance due” semantics.
 */
export function computeBookingOutstandingDisplay(input: BookingOutstandingInputs): number {
  const {
    totalAmount,
    totalPaid,
    totalRefunded,
    walletAmount,
    giftCardAmount,
    unpaidAdditionalCharges,
    paymentStatus,
  } = input;

  const ps = (paymentStatus || "").toLowerCase();
  const effectivePaid = Math.max(0, Number(totalPaid) - Number(totalRefunded));
  const raw = Number(totalAmount) + Number(unpaidAdditionalCharges) - effectivePaid - Number(walletAmount) - Number(giftCardAmount);

  if (ps === "refunded") {
    return 0;
  }

  return Math.max(0, raw);
}
