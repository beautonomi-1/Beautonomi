/**
 * Residual earnings allocation for booking payments when booking-level ledger legs
 * (tip/travel/platform_fee/etc.) were already posted by an earlier payment.
 * Mirrors migration 817 `create_finance_ledger_from_payment` logic for webhooks.
 */

export type ResolveCommissionBaseInput = {
  paymentAmount: number;
  bookingTotal: number;
  platformFee: number;
  tip: number;
  tax: number;
  travel: number;
  /** Sum of positive net from prior posted legs for this booking. */
  postedLegsSum?: number;
  /** Cumulative completed booking_payments including this charge. */
  cumulativePaid?: number;
  /** True when tip/tax/travel/platform_fee rows already exist on the booking. */
  bookingLevelItemsAlreadyPosted?: boolean;
};

export function resolveCommissionBaseForBookingPayment(
  input: ResolveCommissionBaseInput,
): number {
  const paymentAmount = Math.max(0, Number(input.paymentAmount || 0));
  const bookingTotal = Math.max(0, Number(input.bookingTotal || 0));

  if (paymentAmount <= 0) return 0;

  if (input.bookingLevelItemsAlreadyPosted) {
    const cumulativePaid = Math.max(0, Number(input.cumulativePaid ?? paymentAmount));
    const postedLegsSum = Math.max(0, Number(input.postedLegsSum ?? 0));
    const residual = Math.max(0, Math.round((cumulativePaid - postedLegsSum) * 100) / 100);
    return Math.min(paymentAmount, residual);
  }

  const platformFee = Math.max(0, Number(input.platformFee || 0));
  const tip = Math.max(0, Number(input.tip || 0));
  const tax = Math.max(0, Number(input.tax || 0));
  const travel = Math.max(0, Number(input.travel || 0));

  const fullCommissionBase =
    bookingTotal > 0 ? bookingTotal - tip - tax - travel - platformFee : 0;
  const netRevenueRatio = bookingTotal > 0 ? Math.max(0, fullCommissionBase / bookingTotal) : 1;

  return Math.max(0, Math.round(paymentAmount * netRevenueRatio * 100) / 100);
}

/** Transaction types counted toward posted positive legs for residual math. */
export const RESIDUAL_POSTED_LEG_TYPES = [
  "provider_earnings",
  "payment",
  "platform_fee",
  "service_fee",
  "tip",
  "tax",
  "travel_fee",
] as const;

export function sumPostedPositiveLegs(
  rows: Array<{ transaction_type?: string | null; net?: number | null }>,
): number {
  const allowed = new Set<string>(RESIDUAL_POSTED_LEG_TYPES);
  return rows.reduce((sum, row) => {
    const type = String(row.transaction_type ?? "");
    const net = Number(row.net ?? 0);
    if (allowed.has(type) && net > 0) return sum + net;
    return sum;
  }, 0);
}

export function bookingLevelItemsAlreadyPosted(
  rows: Array<{ transaction_type?: string | null }>,
): boolean {
  const bookingLevelTypes = new Set([
    "tip",
    "tax",
    "travel_fee",
    "platform_fee",
    "service_fee",
    "promotion_discount",
    "membership_discount",
    "loyalty_redemption",
  ]);
  return rows.some((row) => bookingLevelTypes.has(String(row.transaction_type ?? "")));
}

/**
 * Positive net that will be posted as deferred booking-level legs in the same run.
 * Must be added to postedLegsSum before residual allocation, otherwise residual treats
 * that cash as provider_earnings and the catch-up insert double-counts it.
 * Tax posts with net=0 so it does not contribute.
 */
export function sumPendingBookingLevelCatchUpNet(input: {
  tipAmount: number;
  travelFee: number;
  platformFee: number;
  existingTypes: ReadonlySet<string>;
}): number {
  let sum = 0;
  const existing = input.existingTypes;
  const platformFee = Math.max(0, Number(input.platformFee || 0));
  const tipAmount = Math.max(0, Number(input.tipAmount || 0));
  const travelFee = Math.max(0, Number(input.travelFee || 0));
  if (
    platformFee > 0 &&
    !existing.has("platform_fee") &&
    !existing.has("service_fee")
  ) {
    sum += platformFee;
  }
  if (tipAmount > 0 && !existing.has("tip")) {
    sum += tipAmount;
  }
  if (travelFee > 0 && !existing.has("travel_fee")) {
    sum += travelFee;
  }
  return Math.round(sum * 100) / 100;
}
