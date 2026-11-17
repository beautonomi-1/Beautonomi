import {
  parseRefundAmount,
  sumCompletedStoreCreditRefunds,
  type BookingRefundSummary,
} from "@/lib/admin/booking-refund-context";
import { isPlatformCollected } from "@/lib/bookings/payment-collected-classifier";
import type { BookingPaymentTender } from "@/lib/admin/refund-tender-labels";
import { addMoney, roundCurrency, subtractMoney } from "@beautonomi/utils";

export type BookingPaymentWithStatus = BookingPaymentTender & {
  status?: string | null;
};

export function sumPendingCashRefundAmount(
  refunds: BookingRefundSummary[] | undefined,
): number {
  return (refunds ?? [])
    .filter(
      (r) =>
        String(r.status ?? "") === "pending" &&
        String(r.refund_method ?? "").toLowerCase() === "cash",
    )
    .reduce((sum, r) => addMoney(sum, parseRefundAmount(r.amount)), 0);
}

/** Max amount for wallet credit (platform leg), or in-person substitute when allowed. */
export function resolveWalletCreditMaxAmount(params: {
  remainingRefundable: number;
  walletRemainingRefundable: number;
  isWalletSubstituteAllowed: boolean;
}): number {
  if (params.isWalletSubstituteAllowed) {
    return Math.max(0, roundCurrency(params.remainingRefundable));
  }
  if (params.walletRemainingRefundable > 0.01) {
    return Math.max(0, roundCurrency(params.walletRemainingRefundable));
  }
  return Math.max(0, roundCurrency(params.remainingRefundable));
}

export function computeWalletRefundableRemaining(params: {
  hasGatewayCapture: boolean;
  captureRemainingTotal: number;
  payments: BookingPaymentWithStatus[];
  bookingRefunds: BookingRefundSummary[] | undefined;
}): number {
  const storeCreditDone = sumCompletedStoreCreditRefunds(params.bookingRefunds);
  if (params.hasGatewayCapture) {
    return Math.max(0, roundCurrency(params.captureRemainingTotal));
  }
  const platformCollected = params.payments
    .filter((p) => isPlatformCollected(p))
    .reduce((sum, p) => addMoney(sum, parseRefundAmount(p.amount)), 0);
  return Math.max(0, subtractMoney(platformCollected, storeCreditDone));
}
