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
  discount?: number;
  membership_discount_amount?: number;
  loyalty_discount_amount?: number;
  cancellation_fee?: number;
};

function reconcileReceiptTotal(receipt: ReceiptInvariantPayload): number {
  const sub = Number(receipt.subtotal ?? 0);
  const travel = Number(receipt.travel_fee ?? 0);
  const tax = Number(receipt.tax ?? 0);
  const fees = Number(receipt.fees ?? 0);
  const tip = Number(receipt.tip_amount ?? 0);
  const disc = Number(receipt.discount ?? 0);
  const mem = Number(receipt.membership_discount_amount ?? 0);
  const loy = Number(receipt.loyalty_discount_amount ?? 0);
  const cancel = Number(receipt.cancellation_fee ?? 0);
  /** Mirrors `/api/bookings/[id]/receipt`: package + promo live in `discount_amount`; membership & loyalty are separate columns. */
  return sub + travel + tax + fees + tip - disc - mem - loy - cancel;
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
  const effectivePaid = Math.max(0, Number(totalPaid) - Number(totalRefunded));
  const raw = Number(totalAmount) + Number(unpaidAdditionalCharges) - effectivePaid - Number(walletAmount) - Number(giftCardAmount);

  if (ps === "refunded") {
    return 0;
  }

  return Math.max(0, raw);
}
