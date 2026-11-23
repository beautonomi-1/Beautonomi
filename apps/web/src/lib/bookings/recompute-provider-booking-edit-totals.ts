import { addMoney, calculateBookingTotals, multiplyMoney, roundCurrency, subtractMoney } from "@beautonomi/utils";

/**
 * Booking edit totals. Tax follows the provider VAT snapshot for this save.
 * The service fee already stored on the booking is added once and is not taxed again.
 */
export function recomputeProviderBookingEditTotals(input: {
  subtotal: number;
  discountAmount: number;
  promotionDiscountAmount: number;
  membershipDiscountAmount: number;
  loyaltyDiscountAmount: number;
  travelFee: number;
  tipAmount: number;
  serviceFeeAmount: number;
  registered: boolean;
  ratePercent: number;
  inclusive: boolean;
}): { taxAmount: number; taxRatePercent: number; totalAmount: number } {
  const ratePercent = input.registered && input.ratePercent > 0 ? input.ratePercent : 0;
  const totals = calculateBookingTotals({
    subtotal: Math.max(0, input.subtotal),
    discountAmount: Math.max(0, input.discountAmount),
    promotionDiscountAmount: Math.max(0, input.promotionDiscountAmount),
    membershipDiscountAmount: Math.max(0, input.membershipDiscountAmount),
    loyaltyDiscountAmount: Math.max(0, input.loyaltyDiscountAmount),
    taxRate: ratePercent / 100,
    taxInclusive: input.inclusive,
    travelFee: Math.max(0, input.travelFee),
    serviceFeePercentage: 0,
    tipAmount: Math.max(0, input.tipAmount),
  });
  return {
    taxAmount: roundCurrency(totals.taxAmount),
    taxRatePercent: ratePercent,
    totalAmount: addMoney(totals.totalAmount, Math.max(0, input.serviceFeeAmount)),
  };
}

/** Service line prices plus add-on and retail product money. Discounts stay outside this sum. */
export function sumProviderBookingLineSubtotal(input: {
  servicePrices: Array<number | string | null | undefined>;
  addons: Array<{ price?: number | string | null; quantity?: number | string | null }>;
  productTotals: Array<number | string | null | undefined>;
}): number {
  let subtotal = 0;
  for (const price of input.servicePrices) {
    subtotal = addMoney(subtotal, Number(price) || 0);
  }
  for (const addon of input.addons) {
    const qty = Math.max(1, Math.floor(Number(addon.quantity) || 1));
    subtotal = addMoney(subtotal, multiplyMoney(Number(addon.price) || 0, qty));
  }
  for (const total of input.productTotals) {
    subtotal = addMoney(subtotal, Number(total) || 0);
  }
  return subtotal;
}

function roundedPercentFee(base: number, percentage: number): number {
  return roundCurrency((Math.max(0, base) * Math.max(0, percentage)) / 100);
}

function feesMatch(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 0.01;
}

/**
 * Platform fee after the subtotal changes. Keeps the same base the stored fee
 * already used (full subtotal, after discounts, or after discounts plus travel)
 * so the booking fee trigger still accepts the row.
 */
export function serviceFeeForUpdatedSubtotal(input: {
  previousSubtotal: number;
  nextSubtotal: number;
  discountAmount: number;
  promotionDiscountAmount: number;
  membershipDiscountAmount: number;
  loyaltyDiscountAmount: number;
  travelFee: number;
  percentage: number;
  currentFeeAmount: number;
}): number {
  const percentage = Number(input.percentage) || 0;
  const currentFee = Math.max(0, Number(input.currentFeeAmount) || 0);
  if (percentage <= 0) return currentFee;

  const discounts =
    Math.max(0, Number(input.discountAmount) || 0) +
    Math.max(0, Number(input.promotionDiscountAmount) || 0) +
    Math.max(0, Number(input.membershipDiscountAmount) || 0) +
    Math.max(0, Number(input.loyaltyDiscountAmount) || 0);
  const travel = Math.max(0, Number(input.travelFee) || 0);
  const previousSubtotal = Math.max(0, Number(input.previousSubtotal) || 0);
  const nextSubtotal = Math.max(0, Number(input.nextSubtotal) || 0);
  const previousAfterDiscounts = Math.max(0, subtractMoney(previousSubtotal, discounts));
  const nextAfterDiscounts = Math.max(0, subtractMoney(nextSubtotal, discounts));

  if (feesMatch(currentFee, roundedPercentFee(previousSubtotal, percentage))) {
    return roundedPercentFee(nextSubtotal, percentage);
  }
  if (feesMatch(currentFee, roundedPercentFee(addMoney(previousAfterDiscounts, travel), percentage))) {
    return roundedPercentFee(addMoney(nextAfterDiscounts, travel), percentage);
  }
  return roundedPercentFee(nextAfterDiscounts, percentage);
}

/**
 * A product added after checkout keeps the platform fee already charged on the
 * online payment. Cash or card then collects only the new retail balance.
 * The percentage is cleared when that historical fee no longer matches the
 * larger subtotal, which is what the booking fee check requires.
 */
export function platformFeeKeptOnRetailAdd(input: {
  currentFeeAmount: number;
  currentPercentage: number;
  nextSubtotal: number;
  discountAmount: number;
  promotionDiscountAmount: number;
  membershipDiscountAmount: number;
  loyaltyDiscountAmount: number;
  travelFee: number;
}): { feeAmount: number; percentage: number } {
  const fee = Math.max(0, Number(input.currentFeeAmount) || 0);
  const percentage = Math.max(0, Number(input.currentPercentage) || 0);
  if (percentage <= 0) return { feeAmount: fee, percentage: 0 };

  const discounts =
    Math.max(0, Number(input.discountAmount) || 0) +
    Math.max(0, Number(input.promotionDiscountAmount) || 0) +
    Math.max(0, Number(input.membershipDiscountAmount) || 0) +
    Math.max(0, Number(input.loyaltyDiscountAmount) || 0);
  const travel = Math.max(0, Number(input.travelFee) || 0);
  const nextSubtotal = Math.max(0, Number(input.nextSubtotal) || 0);
  const afterDiscounts = Math.max(0, subtractMoney(nextSubtotal, discounts));
  const stillMatches =
    feesMatch(fee, roundedPercentFee(nextSubtotal, percentage)) ||
    feesMatch(fee, roundedPercentFee(afterDiscounts, percentage)) ||
    feesMatch(fee, roundedPercentFee(addMoney(afterDiscounts, travel), percentage));
  if (stillMatches) return { feeAmount: fee, percentage };
  return { feeAmount: fee, percentage: 0 };
}

/**
 * Payment status after the booking total changes. Coverage is money already
 * collected minus refunds. A retail add that pushes the total past that
 * coverage becomes partially paid.
 */
export function paymentStatusAfterBookingTotal(input: {
  totalAmount: number;
  totalPaid: number;
  totalRefunded: number;
  currentStatus?: string | null;
}): string {
  const current = String(input.currentStatus ?? "").toLowerCase();
  if (current === "refunded" || current === "failed") return current;
  const paid = Math.max(0, Number(input.totalPaid) || 0);
  const refunded = Math.max(0, Number(input.totalRefunded) || 0);
  const coverage = Math.max(0, subtractMoney(paid, refunded));
  const total = Math.max(0, Number(input.totalAmount) || 0);
  if (coverage <= 0.009) return "pending";
  if (refunded + 0.009 >= paid && paid > 0) return "refunded";
  if (coverage + 0.01 >= total) {
    return refunded > 0.009 ? "partially_refunded" : "paid";
  }
  return "partially_paid";
}
