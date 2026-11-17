import { addMoney, subtractMoney } from "@beautonomi/utils";

/** The capture call returns true only when the reserved gift was taken or was already captured. */
export function giftCardCaptureSucceeded(captured: unknown): boolean {
  return captured === true;
}

/**
 * False means the capture found no reserved redemption. A missing answer has
 * not confirmed that, so the gift stays until the capture is tried again.
 */
export function giftCardCaptureAnswer(captured: unknown): "taken" | "absent" | "unknown" {
  if (captured === true) return "taken";
  if (captured === false) return "absent";
  return "unknown";
}

/**
 * Booking void returns true when the balance is back on the card (including a
 * redemption that was already voided). False means the redemption was not
 * reserved: a captured gift stays spent, and a missing row is also false.
 * Any other answer has not confirmed either fact.
 */
export function bookingGiftVoidOutcome(voided: unknown): "restored" | "spent" | "unknown" {
  if (voided === true) return "restored";
  if (voided === false) return "spent";
  return "unknown";
}

/**
 * A spent void did not put the gift back on the card. Pay the amount written on
 * the settlement error. When that error has no amount, pay the gift the visit
 * still counts only after the visit is closed. An open visit is still using
 * that gift. Nothing counted means there is nothing to return.
 */
export function spentGiftReturnAmount(
  markedAmount: number | null,
  giftCardAmount: number,
  visitClosed: boolean,
): number {
  if (markedAmount != null && markedAmount > 0.009) return markedAmount;
  if (!visitClosed) return 0;
  const counted = Number(giftCardAmount);
  return counted > 0.009 ? counted : 0;
}

export function visitClosedForGiftReturn(status: string | null | undefined): boolean {
  return status === "cancelled" || status === "no_show";
}

/** What the gift retry will still pay, so a second refund does not pay it again. */
export function giftSweepOwes(
  settlementError: string | null | undefined,
  giftCardAmount: number,
  visitClosed: boolean,
): number {
  return spentGiftReturnAmount(
    giftValueStillDueAmount(String(settlementError ?? "")),
    visitClosed ? Number(giftCardAmount) : 0,
    visitClosed,
  );
}

/** The card value was kept out of the wallet until a later return answers. */
export const GIFT_VALUE_STILL_DUE = "Gift card value could not be returned";

export function giftValueStillDueMessage(amount: number): string {
  return `${GIFT_VALUE_STILL_DUE}: ${amount.toFixed(2)}`;
}

export function giftValueStillDueAmount(error: string): number | null {
  if (!error.startsWith(GIFT_VALUE_STILL_DUE)) return null;
  const match = error.match(/Gift card value could not be returned: (\d+(?:\.\d+)?)/);
  const amount = match ? Number(match[1]) : 0;
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Wallet refunds already recorded, plus a gift the sweep still owes.
 * The cancellation preview uses this so that gift is not promised again.
 */
export function platformRefundedKeepingGiftForSweep(
  storeCreditRefunded: number,
  settlementError: string | null | undefined,
  counted?: { giftCardAmount?: number; visitClosed?: boolean },
): number {
  const owed = giftSweepOwes(
    settlementError,
    counted?.visitClosed ? Number(counted.giftCardAmount ?? 0) : 0,
    Boolean(counted?.visitClosed),
  );
  if (owed <= 0.009) return Math.max(0, storeCreditRefunded);
  return addMoney(Math.max(0, storeCreditRefunded), owed);
}

/** A gift the sweep still owes is not refundable again. */
export function refundableExcludingGiftStillDue(
  available: number,
  settlementError: string | null | undefined,
  counted?: { giftCardAmount?: number; visitClosed?: boolean },
): number {
  const owed = giftSweepOwes(
    settlementError,
    counted?.visitClosed ? Number(counted.giftCardAmount ?? 0) : 0,
    Boolean(counted?.visitClosed),
  );
  if (owed <= 0.009) return Math.max(0, available);
  return Math.max(0, subtractMoney(available, owed));
}
