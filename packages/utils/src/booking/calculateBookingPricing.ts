/**
 * Shared pricing computation for provider booking flows.
 * Used by web (AppointmentSidebar), mobile (new.tsx), and server (bookings route).
 *
 * All monetary values are in the provider's currency unit (not cents).
 */

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

/**
 * Pure pricing math — no side effects, no I/O.
 * Handles both tax-inclusive (prices include VAT) and tax-exclusive modes.
 */
export function calculateBookingTotals(input: BookingPricingInput): BookingPricingResult {
  const {
    subtotal,
    discountAmount,
    taxRate,
    taxInclusive,
    travelFee,
    tipAmount,
  } = input;
  const platformFeePercentage =
    input.platformFeePercentage && input.platformFeePercentage !== 0
      ? input.platformFeePercentage
      : input.serviceFeePercentage ?? input.platformFeePercentage ?? 0;

  const afterCatalogDiscount = Math.max(subtotal - discountAmount, 0);
  const afterPromo = Math.max(
    afterCatalogDiscount - Math.max(0, Number(input.promotionDiscountAmount ?? 0)),
    0,
  );
  const afterMembership = Math.max(
    afterPromo - Math.max(0, Number(input.membershipDiscountAmount ?? 0)),
    0,
  );
  /** Same base as server `computeTaxPlatformTipTotal` (post membership/loyalty). */
  const afterDiscount = Math.max(
    afterMembership - Math.max(0, Number(input.loyaltyDiscountAmount ?? 0)),
    0,
  );

  const taxAmount = taxInclusive
    ? afterDiscount - afterDiscount / (1 + taxRate)
    : afterDiscount * taxRate;

  const platformFeeAmount = afterDiscount * platformFeePercentage;

  const totalAmount = taxInclusive
    ? afterDiscount + travelFee + platformFeeAmount + tipAmount
    : afterDiscount + taxAmount + travelFee + platformFeeAmount + tipAmount;

  return {
    subtotal,
    afterDiscount,
    taxAmount,
    platformFeeAmount,
    serviceFeeAmount: platformFeeAmount,
    totalAmount,
  };
}
