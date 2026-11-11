import { addMoney, calculateBookingTotals, roundCurrency } from "@beautonomi/utils";

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
