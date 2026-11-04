function roundMoney2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * A booking can hold one gift-card redemption. A null remaining balance means the
 * reserve call did not take new money. Credit only a new hold, or the same hold
 * again when no gift payment has been recorded yet.
 */
export function giftRedemptionCreditDecision(input: {
  remainingBalance: number | null;
  redemptionAmount: number | null;
  redemptionStatus: string | null;
  giftApply: number;
  existingCheckoutPayment: boolean;
  recordedGiftPayments: number;
}): "credit" | "already_recorded" | "reject" {
  if (input.existingCheckoutPayment) return "already_recorded";
  if (input.remainingBalance != null && Number.isFinite(Number(input.remainingBalance))) {
    return "credit";
  }
  const held = Number(input.redemptionAmount);
  const status = input.redemptionStatus;
  const sameHold =
    Number.isFinite(held) &&
    Math.abs(held - Math.max(0, input.giftApply)) <= 0.02 &&
    (status === "reserved" || status === "captured") &&
    Math.max(0, input.recordedGiftPayments) <= 0.02;
  return sameHold ? "credit" : "reject";
}

/** How much of a gift card pays the balance, and how much of it pays the till tip. */
export function allocateCheckoutGift(input: {
  owedBase: number;
  checkoutTip: number;
  giftRequested: number;
}): { giftBase: number; giftTip: number } {
  const owed = Math.max(0, Number(input.owedBase) || 0);
  const tip = Math.max(0, Number(input.checkoutTip) || 0);
  const requested = Math.max(0, Number(input.giftRequested) || 0);
  const giftApply = Math.min(requested, Math.round((owed + tip) * 100) / 100);
  const giftBase = Math.min(giftApply, owed);
  return {
    giftBase: Math.round(giftBase * 100) / 100,
    giftTip: Math.round((giftApply - giftBase) * 100) / 100,
  };
}

export function applyCheckoutBillAdjustment(input: {
  totalAmount: number;
  tipAmount: number;
  discountAmount: number;
  checkoutTip: number;
  checkoutDiscount: number;
  /** Undo a till adjustment when the card machine is cancelled before it captures. */
  revert?: boolean;
}): { totalAmount: number; tipAmount: number; discountAmount: number } {
  const sign = input.revert ? -1 : 1;
  const tip = Math.max(0, Number(input.checkoutTip) || 0) * sign;
  const discount = Math.max(0, Number(input.checkoutDiscount) || 0) * sign;
  return {
    totalAmount: roundMoney2(Math.max(0, Number(input.totalAmount) + tip - discount)),
    tipAmount: roundMoney2(Math.max(0, Number(input.tipAmount) + tip)),
    discountAmount: roundMoney2(Math.max(0, Number(input.discountAmount) + discount)),
  };
}
