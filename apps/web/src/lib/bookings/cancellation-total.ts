/**
 * When only cancellation_fee changes, move total_amount by the fee delta instead of
 * rebuilding from subtotal/discount/tax (which drops promo/membership/loyalty discounts).
 */
export function totalAmountAfterCancellationFeeChange(
  currentTotal: number,
  currentFee: number,
  nextFee: number,
): number | undefined {
  if (nextFee === currentFee) {
    return undefined;
  }
  const adjusted = currentTotal - (nextFee - currentFee);
  return Math.round(adjusted * 100) / 100;
}
