/**
 * Canonical booking pricing helpers shared by public validate-booking and provider routes.
 * Monetary values are in major currency units (e.g. ZAR), not cents.
 */

import { computeVat, percentOf, roundCurrency, sumMoney } from "@beautonomi/utils";

export type BookingPricingTaxMode = {
  taxRatePercent: number;
  taxIncluded: boolean;
};

/**
 * Tax + platform fee + tip totals after all line discounts and loyalty,
 * on a single base that already includes travel when applicable.
 */
export function computeTaxPlatformTipTotal(input: {
  baseAfterMembershipAndLoyalty: number;
  tipAmount: number;
  tax: BookingPricingTaxMode;
  platformFeePercentage: number;
  platformFeeFixed: number;
  platformFeeType: "percentage" | "fixed_amount";
  /** When percentage fee, cap fee at this amount if set */
  platformFeeMax?: number | null;
}): { taxAmount: number; platformFeeAmount: number; totalAmount: number } {
  const {
    baseAfterMembershipAndLoyalty: base,
    tipAmount,
    tax,
    platformFeePercentage,
    platformFeeFixed,
    platformFeeType,
    platformFeeMax,
  } = input;

  const rate = Math.max(0, tax.taxRatePercent);
  const vat = computeVat({
    baseAmount: base,
    ratePercent: rate,
    inclusive: tax.taxIncluded,
  });
  const taxAmount = vat.taxAmount;

  let platformFeeAmount = 0;
  if (platformFeeType === "percentage") {
    platformFeeAmount = percentOf(base, platformFeePercentage);
    if (platformFeeMax != null && platformFeeMax > 0) {
      platformFeeAmount = Math.min(platformFeeAmount, roundCurrency(Number(platformFeeMax)));
    }
  } else {
    platformFeeAmount = roundCurrency(platformFeeFixed);
  }

  const totalAmount = tax.taxIncluded
    ? sumMoney(base, tipAmount, platformFeeAmount)
    : sumMoney(base, tipAmount, taxAmount, platformFeeAmount);

  return { taxAmount, platformFeeAmount, totalAmount };
}
