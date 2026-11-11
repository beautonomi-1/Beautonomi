import { subtractMoney } from "@beautonomi/utils";
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
  return subtractMoney(currentTotal, subtractMoney(nextFee, currentFee));
}
