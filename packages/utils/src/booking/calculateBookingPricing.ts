/**
 * Shared pricing computation for provider booking flows.
 * Used by web (AppointmentSidebar), mobile (new.tsx), and server (bookings route).
 *
 * All monetary values are in the provider's currency unit (not cents).
 */

import { percentOf, subtractMoney, sumMoney } from "../money";
import { computeVat } from "../vat/computeVat";

/** Location types that may carry a travel fee. */
export type BookingTravelLocationType = "at_salon" | "at_home" | "walk_in" | string;

/**
 * Travel fees apply only for at-home bookings. Use this everywhere client totals
 * are computed so toggling back to in-salon clears travel from checkout math.
 */
export function effectiveTravelFee(
  locationType: BookingTravelLocationType,
  rawFee: number
): number {
  return locationType === "at_home" ? Math.max(0, Number(rawFee) || 0) : 0;
}

export interface BookingPricingInput {
  subtotal: number;
  /** Package + manual catalog discount (matches bookings.discount_amount). */
  discountAmount: number;
  /** Promotion code discount applied after catalog discount. */
  promotionDiscountAmount?: number;
  /** Membership plan discount applied after promotion. */
  membershipDiscountAmount?: number;
  /** Loyalty tier discount applied after membership. */
  loyaltyDiscountAmount?: number;
  /** Fractional tax rate, e.g. 0.15 for 15%. */
  taxRate: number;
  /** When true, prices already include tax (SA VAT-inclusive model). */
  taxInclusive: boolean;
  travelFee: number;
  /** Fractional platform-fee rate, e.g. 0.1 for 10%. */
  platformFeePercentage?: number;
  /** @deprecated Legacy name for platformFeePercentage. */
  serviceFeePercentage?: number;
  tipAmount: number;
  currency?: string;
}

export interface BookingPricingResult {
  subtotal: number;
  afterDiscount: number;
  taxAmount: number;
  platformFeeAmount: number;
  /** @deprecated Legacy alias for platformFeeAmount. */
  serviceFeeAmount: number;
  totalAmount: number;
}

function nonNeg(n: number): number {
  return Math.max(0, Number(n) || 0);
}

/**
 * Pure pricing math — no side effects, no I/O.
 * Handles both tax-inclusive (prices include VAT) and tax-exclusive modes.
 * Money ops go through roundCurrency / percentOf / computeVat so web, app, and
 * PG `validate_booking_total` (10142) agree to the cent.
 */
export function calculateBookingTotals(input: BookingPricingInput): BookingPricingResult {
  const currency = input.currency ?? "ZAR";
  const subtotal = nonNeg(input.subtotal);
  const discountAmount = nonNeg(input.discountAmount);
  const taxRate = Math.max(0, Number(input.taxRate) || 0);
  const taxInclusive = Boolean(input.taxInclusive);
  const travelFee = nonNeg(input.travelFee);
  const tipAmount = nonNeg(input.tipAmount);
  const platformFeePercentage =
    input.platformFeePercentage && input.platformFeePercentage !== 0
      ? input.platformFeePercentage
      : input.serviceFeePercentage ?? input.platformFeePercentage ?? 0;

  const afterCatalogDiscount = Math.max(subtractMoney(subtotal, discountAmount, currency), 0);
  const afterPromo = Math.max(
    subtractMoney(afterCatalogDiscount, nonNeg(input.promotionDiscountAmount ?? 0), currency),
    0,
  );
  const afterMembership = Math.max(
    subtractMoney(afterPromo, nonNeg(input.membershipDiscountAmount ?? 0), currency),
    0,
  );
  /** Same base as server `computeTaxPlatformTipTotal` (post membership/loyalty). */
  const afterDiscount = Math.max(
    subtractMoney(afterMembership, nonNeg(input.loyaltyDiscountAmount ?? 0), currency),
    0,
  );

  const vat = computeVat({
    baseAmount: afterDiscount,
    ratePercent: taxRate * 100,
    inclusive: taxInclusive,
    currency,
  });
  const taxAmount = vat.taxAmount;
  const platformFeeAmount = percentOf(afterDiscount, platformFeePercentage * 100, currency);

  const totalAmount = taxInclusive
    ? sumMoney(currency, afterDiscount, travelFee, platformFeeAmount, tipAmount)
    : sumMoney(currency, afterDiscount, taxAmount, travelFee, platformFeeAmount, tipAmount);

  return {
    subtotal,
    afterDiscount,
    taxAmount,
    platformFeeAmount,
    serviceFeeAmount: platformFeeAmount,
    totalAmount,
  };
}

/**
 * Mirrors `validate_booking_total` in 10142: one formula, VAT added only when
 * tax_inclusive is false. Tolerance on the trigger is ±0.01.
 */
export function expectedPersistedBookingTotal(input: {
  subtotal: number;
  discountAmount?: number;
  promotionDiscountAmount?: number;
  membershipDiscountAmount?: number;
  loyaltyDiscountAmount?: number;
  taxAmount?: number;
  taxInclusive?: boolean | null;
  serviceFeeAmount?: number;
  travelFee?: number;
  tipAmount?: number;
  cancellationFee?: number;
  currency?: string;
}): number {
  const currency = input.currency ?? "ZAR";
  const inclusive = input.taxInclusive ?? true;
  let net = nonNeg(input.subtotal);
  net = subtractMoney(net, nonNeg(input.discountAmount ?? 0), currency);
  net = subtractMoney(net, nonNeg(input.promotionDiscountAmount ?? 0), currency);
  net = subtractMoney(net, nonNeg(input.membershipDiscountAmount ?? 0), currency);
  net = Math.max(0, subtractMoney(net, nonNeg(input.loyaltyDiscountAmount ?? 0), currency));
  const tax = inclusive ? 0 : nonNeg(input.taxAmount ?? 0);
  return Math.max(
    0,
    subtractMoney(
      sumMoney(
        currency,
        net,
        tax,
        nonNeg(input.serviceFeeAmount ?? 0),
        nonNeg(input.travelFee ?? 0),
        nonNeg(input.tipAmount ?? 0),
      ),
      nonNeg(input.cancellationFee ?? 0),
      currency,
    ),
  );
}
