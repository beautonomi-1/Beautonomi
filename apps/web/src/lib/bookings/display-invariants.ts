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
 * **Outstanding** — For display: `max(0, total_amount + unpaid_additional_charges − effective_paid)`
 * where `effective_paid = max(0, total_paid − total_refunded)` and `total_paid` (per migration 582)
 * already includes wallet + gift-card settlement amounts via `booking_payments`. The legacy
 * `wallet_amount` / `gift_card_amount` columns are display/audit only — using them as an extra
 * deduction here double-subtracts whenever a booking_payments row exists for the same credit.
 * For **cancelled** or **refunded** bookings, show **0** outstanding when nothing is owed
 * (use `payment_status` + `total_refunded` to avoid implying debt after full refund).
 */
export const BOOKING_FINANCIAL_INVARIANTS_DOC = "display-invariants.ts";

export {
  DEFAULT_BOOKING_DISPLAY_TIMEZONE,
  bookingLifecycleStatus,
  bookingScheduleYmd,
  effectiveScheduleAt,
  isPendingOrQueueBooking,
  isTerminalScheduleBooking,
  resolveBookingDisplayTimezone,
  type BookingScheduleLine,
  type BookingScheduleRow,
} from "@beautonomi/utils";

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
/**
 * Whether to show package name / package-discount lines on receipts and confirmations.
 * Requires either a redeemed entitlement session or a non-zero inferred catalog package discount.
 */
export function computePackageAppliedForDisplay(input: {
  package_id?: string | null;
  customer_package_entitlement_id?: string | null;
  discount_amount?: number | null;
  promotion_discount_amount?: number | null;
}): boolean {
  const pid = input.package_id;
  const hasPackage = typeof pid === "string" && pid.length > 0;
  if (!hasPackage) return false;
  const ent = input.customer_package_entitlement_id;
  if (typeof ent === "string" && ent.trim().length > 0) return true;
  const inferredPackagePortion = Math.max(
    0,
    Number(input.discount_amount ?? 0) - Number(input.promotion_discount_amount ?? 0),
  );
  return inferredPackagePortion > 0;
}

export type ReceiptInvariantPayload = {
  total: number;
  subtotal?: number;
  travel_fee?: number;
  tax?: number;
  fees?: number;
  tip_amount?: number;
  /** Manual + catalog package discount (excludes promo when `promotion_discount_amount` is set). */
  discount?: number;
  promotion_discount_amount?: number;
  membership_discount_amount?: number;
  loyalty_discount_amount?: number;
  cancellation_fee?: number;
};

export function reconcileReceiptTotal(receipt: ReceiptInvariantPayload): number {
  const sub = Number(receipt.subtotal ?? 0);
  const travel = Number(receipt.travel_fee ?? 0);
  const tax = Number(receipt.tax ?? 0);
  const fees = Number(receipt.fees ?? 0);
  const tip = Number(receipt.tip_amount ?? 0);
  const disc = Number(receipt.discount ?? 0);
  const promo = Number(receipt.promotion_discount_amount ?? 0);
  const mem = Number(receipt.membership_discount_amount ?? 0);
  const loy = Number(receipt.loyalty_discount_amount ?? 0);
  const cancel = Number(receipt.cancellation_fee ?? 0);
  /** Mirrors decomposed booking columns: discount_amount + promotion + membership + loyalty. */
  return sub + travel + tax + fees + tip - disc - promo - mem - loy - cancel;
}

/**
 * Dev-only: throws when PDF/JSON receipt lines do not reconcile to `total`
 * (matches customer receipt fallback math). No-op in production.
 */
export function assertReceiptInvariant(label: string, receipt: ReceiptInvariantPayload): void {
  if (process.env.NODE_ENV === "production") return;
  const reconstructed = reconcileReceiptTotal(receipt);
  const total = Number(receipt.total ?? 0);
  if (Math.abs(reconstructed - total) > 0.05) {
    throw new Error(
      `[receipt-invariant] ${label}: reconstructed ${reconstructed.toFixed(2)} vs total ${total.toFixed(2)}`,
    );
  }
}

/** Dev-only sanity check (warn only). Prefer {@link assertReceiptInvariant} in PDF routes. */
export function warnIfReceiptTotalDriftsDevOnly(label: string, receipt: ReceiptInvariantPayload): void {
  if (process.env.NODE_ENV === "production") return;
  const reconstructed = reconcileReceiptTotal(receipt);
  const total = Number(receipt.total ?? 0);
  if (Math.abs(reconstructed - total) > 0.05) {
    console.warn(`[receipt-math] ${label}: reconstructed ${reconstructed.toFixed(2)} vs total ${total.toFixed(2)}`);
  }
}

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
  if (ps === "refunded") return 0;

  /**
   * §Finance-truth 2026-05: post-migration 582 `total_paid` is the canonical
   * SUM(booking_payments.amount WHERE status IN ('completed','partially_refunded')).
   * That sum already covers wallet + gift card credits because migration 582
   * (and `ensureWalletGiftBookingPayments` at runtime) backfill synthetic
   * booking_payments rows with `payment_method = 'wallet'` / `'gift_card'`.
   *
   * For pre-582 bookings that were paid only via wallet/gift but never had a
   * synthetic booking_payments row, we fall back to wallet+gift to avoid
   * showing phantom outstanding. We pick the LARGER of the two coverage
   * estimates — never their sum — so we never double-subtract.
   */
  const effectivePaid = Math.max(0, Number(totalPaid) - Number(totalRefunded));
  const walletGiftCoverage = Math.max(0, Number(walletAmount) + Number(giftCardAmount));
  const coverage = Math.max(effectivePaid, walletGiftCoverage);
  const raw = Number(totalAmount) + Number(unpaidAdditionalCharges) - coverage;
  return Math.max(0, raw);
}
