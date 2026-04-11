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
  serviceFeePercentage: number;
  tipAmount: number;
}

export interface BookingPricingResult {
  subtotal: number;
  afterDiscount: number;
  taxAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
}

/**
 * Pure pricing math — no side effects, no I/O.
 * Handles both tax-inclusive (prices include VAT) and tax-exclusive modes.
 */
export function calculateBookingTotals(input: BookingPricingInput): BookingPricingResult {
  const { subtotal, discountAmount, taxRate, taxInclusive, travelFee, serviceFeePercentage, tipAmount } = input;

  const afterDiscount = Math.max(subtotal - discountAmount, 0);

  const taxAmount = taxInclusive
    ? afterDiscount - afterDiscount / (1 + taxRate)
    : afterDiscount * taxRate;

  const serviceFeeAmount = afterDiscount * serviceFeePercentage;

  const totalAmount = taxInclusive
    ? afterDiscount + travelFee + serviceFeeAmount + tipAmount
    : afterDiscount + taxAmount + travelFee + serviceFeeAmount + tipAmount;

  return { subtotal, afterDiscount, taxAmount, serviceFeeAmount, totalAmount };
}
