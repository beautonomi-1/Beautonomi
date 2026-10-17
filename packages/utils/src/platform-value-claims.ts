/**
 * Canonical platform value props for provider nudges (web + mobile).
 * Keep copy factual and aligned with enforced product behavior.
 */

export const PLATFORM_ON_APP_PAYMENT_CLAIMS = {
  /** Dashboard / booking-detail nudge (one sentence). */
  onPlatformSettlement:
    "When clients pay here, deposits, late fees, and your bank payout stay on one ledger. Cash is yours in the till — you just cannot keep a cancellation fee from it.",
  /** Shorter variant for tight UI rows. */
  onPlatformSettlementShort:
    "Online payments land in your withdrawable payout. Cash and card-machine takings stay with you.",
} as const;

/** SMS when sharing a public booking link after a walk-in visit. */
export function providerShareBookingLinkSms(link: string): string {
  return `Book your next visit with me here so your slot is held: ${link}`;
}

/** Post cash/walk-in complete — peak-end nudge (one screen, dismissible). */
export function providerPostCashCompleteShareLine(clientName: string): string {
  const who = clientName.trim() || "your client";
  return `Book ${who}'s next visit on Beautonomi — they earn loyalty and can review today's visit.`;
}

/** After cash no-show / late cancel with no platform payment. */
export function providerNoFeeCashLossLine(clientName: string): string {
  const who = clientName.trim() || "your client";
  return `No fee to keep — this visit wasn't paid on Beautonomi. Send ${who} your booking link so next time a deposit is taken.`;
}

export function providerOnPlatformPaymentNudgeText(): string {
  return PLATFORM_ON_APP_PAYMENT_CLAIMS.onPlatformSettlement;
}
