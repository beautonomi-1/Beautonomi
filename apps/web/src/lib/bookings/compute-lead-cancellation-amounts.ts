import { subtractMoney } from "@beautonomi/utils";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";

/** Lead-customer wallet/fee after guest share funds are returned to guests' cards. */
export function computeLeadCancellationAmounts(input: {
  platformCollected: number;
  guestSharesHeld: number;
  feeRetained: number;
  walletRefund: number;
}): {
  guestSharesHeld: number;
  leadFeeRetained: number;
  leadWalletRefund: number;
} {
  const guestSharesHeld = roundCurrency2(Math.max(0, input.guestSharesHeld));
  const leadPool = Math.max(0, subtractMoney(input.platformCollected, guestSharesHeld));
  const leadFeeRetained = roundCurrency2(Math.min(input.feeRetained, leadPool));
  const leadWalletRefund = roundCurrency2(
    Math.max(0, Math.min(input.walletRefund, subtractMoney(leadPool, leadFeeRetained))),
  );
  return { guestSharesHeld, leadFeeRetained, leadWalletRefund };
}
