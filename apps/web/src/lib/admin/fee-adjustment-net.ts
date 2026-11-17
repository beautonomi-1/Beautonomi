/** Net platform amount on a finance row after a fee adjustment (commission unchanged). */
import { subtractMoney } from "@beautonomi/utils";
export function financeNetAfterFeeAdjustment(
  amount: number,
  adjustedFee: number,
  commission: number,
): number {
  return subtractMoney(subtractMoney(Number(amount), Number(adjustedFee)), Number(commission ?? 0));
}

/** Net amount on a payment_transactions row after fee adjustment. */
export function paymentNetAfterFeeAdjustment(amount: number, adjustedFee: number): number {
  return subtractMoney(Number(amount), Number(adjustedFee));
}
