/**
 * Shared pricing computation for provider booking flows.
 * Used by web (AppointmentSidebar), mobile (new.tsx), and server (bookings route).
 *
 * All monetary values are in the provider's currency unit (not cents).
 */

export interface BookingPricingInput {
  subtotal: number;
  discountAmount: number;
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

  const afterDiscount = Math.max(subtotal - discountAmount, 0);

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
