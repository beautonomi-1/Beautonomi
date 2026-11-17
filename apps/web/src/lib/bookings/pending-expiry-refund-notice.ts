import { cancellationNoticeFromSettlement } from "@/lib/bookings/cancellation-outcome-bridge";
import { buildPendingExpiryRefundCopy } from "@/lib/bookings/lifecycle-deadlines";

export function pendingExpiryRefundNotice(input: {
  paymentStatus?: string | null;
  currency?: string | null;
  settlementFailed?: boolean;
  settlement?: {
    walletRefundAmount?: number;
    refundResult?: { success?: boolean };
    giftCardVoidAttempted?: boolean;
    giftValueStillDue?: boolean;
    inPersonCashRefundDue?: number;
  } | null;
}): { refundInfo: string; walletRefund: number | undefined } {
  const currency = input.currency || "ZAR";
  const unpaid = input.paymentStatus === "pending" || input.paymentStatus === "unpaid";
  const settlement = input.settlement;
  if (input.settlementFailed || !settlement) {
    if (unpaid) {
      return { refundInfo: buildPendingExpiryRefundCopy(input.paymentStatus), walletRefund: undefined };
    }
    return {
      refundInfo:
        "Your refund is still processing and will be credited once it completes. No cancellation fee applies.",
      walletRefund: undefined,
    };
  }
  const notice = cancellationNoticeFromSettlement({
    currency,
    walletRefundAmount: Number(settlement.walletRefundAmount ?? 0),
    refundSucceeded: settlement.refundResult ? settlement.refundResult.success === true : true,
    giftCardRestored: settlement.giftCardVoidAttempted === true,
    giftValueStillDue: settlement.giftValueStillDue === true,
    inPersonRefundDue: settlement.inPersonCashRefundDue,
  });
  const nothingReturned =
    notice.walletRefund == null &&
    settlement.giftCardVoidAttempted !== true &&
    settlement.giftValueStillDue !== true &&
    Number(settlement.inPersonCashRefundDue ?? 0) <= 0.009 &&
    !notice.refundPending;
  if (unpaid && nothingReturned) {
    return { refundInfo: buildPendingExpiryRefundCopy("unpaid"), walletRefund: undefined };
  }
  return {
    refundInfo: `${notice.refundInfo} No cancellation fee applies.`,
    walletRefund: notice.walletRefund,
  };
}
