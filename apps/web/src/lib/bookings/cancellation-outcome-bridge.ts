import { subtractMoney } from "@beautonomi/utils";
import type { CancellationPolicy } from "@/lib/bookings/cancellation-policy";
import { giftValueStillDueAmount } from "@/lib/bookings/gift-value-still-due";
import {
  describeCancellationRefund,
  roundCurrency2,
} from "@/lib/bookings/refund-processing";
import type {
  CancellationOutcome,
  CancelActor,
  CancelBlockCode,
} from "@/lib/bookings/resolve-cancellation-outcome";
import type {
  CancellationSettledBy,
  SettleBookingCancellationParams,
} from "@/lib/bookings/settle-booking-cancellation";

export function mapCancelActorToSettledBy(actor: CancelActor): CancellationSettledBy {
  if (actor === "provider_customer_requested") return "customer";
  if (actor === "no_show") return "no_show";
  return actor;
}

export function providerCancelInitiatorToActor(
  initiator: string | null | undefined,
): CancelActor {
  return initiator === "customer_requested" ? "provider_customer_requested" : "provider";
}

export function cancellationBlockedHttpStatus(code?: CancelBlockCode): number {
  if (code === "ALREADY_CANCELLED") return 400;
  if (code === "NO_SHOW_TOO_EARLY") return 409;
  if (code === "SERVICE_STARTED") return 403;
  return 403;
}

export function assertCancellationAllowed(outcome: CancellationOutcome): {
  ok: boolean;
  message: string;
  code: CancelBlockCode;
  httpStatus: number;
} {
  if (outcome.allowed) {
    return { ok: true, message: "", code: "CANCELLATION_BLOCKED", httpStatus: 200 };
  }
  return {
    ok: false,
    message: outcome.blockReason ?? "Cancellation not allowed",
    code: outcome.blockCode ?? "CANCELLATION_BLOCKED",
    httpStatus: cancellationBlockedHttpStatus(outcome.blockCode),
  };
}

/** Map resolveCancellationOutcome amounts into settleBookingCancellation inputs. */
export function settleParamsFromCancellationOutcome(
  outcome: CancellationOutcome,
  actor: CancelActor,
  base: Omit<
    SettleBookingCancellationParams,
    "policy" | "isLateCancellation" | "explicitCancellationFee" | "maxWalletCredit" | "cancelledBy"
  >,
): SettleBookingCancellationParams {
  return {
    ...base,
    cancelledBy: mapCancelActorToSettledBy(actor),
    policy: outcome.policy as CancellationPolicy,
    isLateCancellation: outcome.isLate,
    maxWalletCredit: outcome.platformCollected,
    explicitCancellationFee: outcome.feeRetained,
  };
}

export function describeRefundFromOutcome(
  outcome: CancellationOutcome,
  bookingTotal: number,
  currency: string,
): string {
  const base = describeCancellationRefund(
    outcome.policy,
    outcome.isLate,
    outcome.walletRefund,
    bookingTotal,
    currency,
    { inPersonRefundDue: outcome.inPersonRefundDue },
  );
  if (outcome.inPersonRefundDue > 0.01 && outcome.walletRefund > 0) {
    return `${base} ${currency} ${roundCurrency2(outcome.inPersonRefundDue).toFixed(2)} paid in person will be returned to you by the provider.`;
  }
  return base;
}

/**
 * Wording for a cancellation notice after settlement has answered.
 * Uses the wallet amount that was credited. A restored gift card is described
 * on its own. A refund that has not finished is not described as credited.
 */
export function describeSettledCancellationRefund(input: {
  walletRefundAmount: number;
  currency: string;
  refundPending: boolean;
  giftCardRestored?: boolean;
  giftValueStillDue?: boolean;
  inPersonRefundDue?: number;
  terminalRefundDue?: number;
}): string {
  const currency = input.currency;
  const wallet = Math.max(0, Number(input.walletRefundAmount) || 0);
  const inPerson = Math.max(0, Number(input.inPersonRefundDue) || 0);
  const terminal = Math.max(0, Number(input.terminalRefundDue) || 0);
  const giftSentence = input.giftCardRestored
    ? "Your gift card was returned to the card."
    : input.giftValueStillDue
      ? "The gift card return is still processing."
      : "";

  let text = "";
  if (input.refundPending && terminal > 0.01) {
    text =
      "Card payments are being refunded to the card you paid with. Your remaining refund is still processing.";
  } else if (input.refundPending) {
    text = "Your refund is still processing and will be credited once it completes.";
  } else if (terminal > 0.01 && wallet > 0.009) {
    text =
      "Card payments are being refunded to the card you paid with; the rest has been credited to your Beautonomi wallet.";
  } else if (terminal > 0.01) {
    text = "Your payment is being refunded to the card you paid with.";
  } else if (wallet > 0.009) {
    text = `A refund of ${currency} ${wallet.toFixed(2)} was credited to your wallet.`;
  }

  if (giftSentence) {
    text = text ? `${text} ${giftSentence}` : giftSentence;
  }
  if (inPerson > 0.01) {
    const extra = `${currency} ${inPerson.toFixed(2)} paid in person will be returned to you by the provider.`;
    text = text ? `${text} ${extra}` : extra;
  }
  if (!text) {
    return "No refund will be credited for this cancellation per the provider's policy.";
  }
  return text;
}

export function cancellationNoticeFromGroupChild(child: {
  walletRefund: number;
  inPersonRefundDue: number;
  currency?: string;
  settlementFailed?: boolean;
  refundSucceeded?: boolean;
  giftCardRestored?: boolean;
  giftValueStillDue?: boolean;
}): { refundInfo: string; walletRefund: number | undefined; refundPending: boolean } {
  const settlementFailed = child.settlementFailed === true;
  return cancellationNoticeFromSettlement({
    currency: child.currency || "ZAR",
    walletRefundAmount: child.walletRefund,
    refundSucceeded: settlementFailed ? false : child.refundSucceeded !== false,
    settlementFailed,
    giftCardRestored: child.giftCardRestored === true,
    giftValueStillDue: child.giftValueStillDue === true,
    inPersonRefundDue: child.inPersonRefundDue,
  });
}

export function cancellationNoticeFromSettlement(input: {
  currency: string;
  walletRefundAmount: number;
  refundSucceeded: boolean;
  settlementFailed?: boolean;
  giftCardRestored?: boolean;
  giftValueStillDue?: boolean;
  inPersonRefundDue?: number;
  terminalRefundDue?: number;
}): { refundInfo: string; walletRefund: number | undefined; refundPending: boolean } {
  const wallet = Math.max(0, Number(input.walletRefundAmount) || 0);
  const refundPending =
    input.settlementFailed === true || (wallet > 0.009 && input.refundSucceeded !== true);
  const credited = !refundPending && wallet > 0.009 ? wallet : undefined;
  return {
    refundPending,
    walletRefund: credited,
    refundInfo: describeSettledCancellationRefund({
      walletRefundAmount: credited ?? 0,
      currency: input.currency,
      refundPending,
      giftCardRestored: input.giftCardRestored === true,
      giftValueStillDue: input.giftValueStillDue === true,
      inPersonRefundDue: input.inPersonRefundDue,
      terminalRefundDue: input.terminalRefundDue,
    }),
  };
}

const GIFT_CARD_STILL_HELD_TEXT = "Gift card could not be returned";

/** Wallet credits for a booking refund are keyed by the refund row, not always by the booking id. */
export function refundWalletIdempotencyKeys(bookingId: string, refundIds: string[]): string[] {
  const keys = new Set<string>([`gift_value_still_due:${bookingId}`]);
  for (const refundId of refundIds) {
    if (!refundId) continue;
    keys.add(`booking_refund:${refundId}`);
    keys.add(`provider_booking_refund:${refundId}`);
    keys.add(`provider_booking_refund_gift:${refundId}`);
    keys.add(`provider_booking_refund_revert:${refundId}`);
    keys.add(`admin_payment_refund:${refundId}`);
    keys.add(`admin_refund_gift_spent:${refundId}`);
    keys.add(`dispute_refund:${refundId}`);
    keys.add(`provider_charge_refund:${refundId}`);
  }
  return [...keys];
}

/**
 * A later cancellation notice must not treat the recorded refund total as a
 * wallet credit. That total also holds a gift put back on the card and money
 * returned in person or to the original card.
 */
export function describeResendCancellationRefund(input: {
  currency: string;
  cancellationType?: "normal" | "late_cancel" | "no_show";
  feeRetained: number;
  totalPaid: number;
  settled: boolean;
  settlementError?: string | null;
  walletCredited: number;
  storeCreditRecorded: number;
  inPersonAmount: number;
  cardAmount: number;
  /** False when the refund or wallet lookup failed. A missing credit must not be described as a gift card. */
  recordsKnown?: boolean;
}): { refundInfo: string; walletRefund: number | undefined } {
  const currency = input.currency || "ZAR";
  const error = String(input.settlementError ?? "");
  const heldValue = giftValueStillDueAmount(error);
  const giftValueStillDue =
    (heldValue != null && heldValue > 0.009) ||
    (heldValue == null && error.includes(GIFT_CARD_STILL_HELD_TEXT));
  const wallet = Math.max(0, Number(input.walletCredited) || 0);
  const storeCredit = Math.max(0, Number(input.storeCreditRecorded) || 0);
  const recordsKnown = input.recordsKnown !== false;
  const giftRestored =
    recordsKnown && !giftValueStillDue && subtractMoney(storeCredit, wallet) > 0.009;
  const inPerson = Math.max(0, Number(input.inPersonAmount) || 0);
  const card = Math.max(0, Number(input.cardAmount) || 0);
  const paidKnown = Number.isFinite(input.totalPaid);
  const paid = paidKnown ? Math.max(0, Number(input.totalPaid) || 0) : 0;
  const nothingReturned =
    wallet <= 0.009 && inPerson <= 0.009 && card <= 0.009 && !giftRestored && !giftValueStillDue;
  const storeCreditUnconfirmed = !recordsKnown && subtractMoney(storeCredit, wallet) > 0.009;
  const fee = Math.max(0, Number(input.feeRetained) || 0);
  const feeSentence =
    fee > 0.009 ? `A cancellation fee of ${currency} ${fee.toFixed(2)} was retained.` : "";

  let body: string;
  let walletRefund: number | undefined;
  if (!recordsKnown && (!paidKnown || paid > 0.009 || storeCreditUnconfirmed || wallet > 0.009)) {
    body = "Your refund is still processing and will be credited once it completes.";
    walletRefund = undefined;
  } else if (nothingReturned && paid <= 0.009) {
    body = feeSentence || "No amounts were collected on this booking.";
    walletRefund = undefined;
  } else if (!input.settled && nothingReturned && paid > 0.009) {
    body = "Your refund is still processing and will be credited once it completes.";
    walletRefund = undefined;
  } else {
    const notice = cancellationNoticeFromSettlement({
      currency,
      walletRefundAmount: wallet,
      refundSucceeded: true,
      giftCardRestored: giftRestored,
      giftValueStillDue,
      inPersonRefundDue: inPerson,
      terminalRefundDue: card,
    });
    body = notice.refundInfo;
    walletRefund = notice.walletRefund;
  }

  if (feeSentence && body !== feeSentence) body = `${feeSentence} ${body}`;
  if (input.cancellationType === "no_show") body = `Marked as no-show. ${body}`;
  return { refundInfo: body, walletRefund };
}
