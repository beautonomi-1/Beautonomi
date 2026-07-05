/** Net platform amount on a finance row after a fee adjustment (commission unchanged). */
export function financeNetAfterFeeAdjustment(
  amount: number,
  adjustedFee: number,
  commission: number,
): number {
  return Number(amount) - Number(adjustedFee) - Number(commission ?? 0);
}

/** Net amount on a payment_transactions row after fee adjustment. */
export function paymentNetAfterFeeAdjustment(amount: number, adjustedFee: number): number {
  return Number(amount) - Number(adjustedFee);
}
