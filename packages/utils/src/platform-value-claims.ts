/**
 * Canonical platform value props for provider nudges (web + mobile).
 * Keep copy factual and aligned with enforced product behavior.
 */

export const PLATFORM_ON_APP_PAYMENT_CLAIMS = {
  /** Dashboard / booking-detail nudge (one sentence). */
  onPlatformSettlement:
    "When clients book here, you receive the service price; booking protection is a separate customer-paid amount kept by Beautonomi.",
  /** Shorter variant for tight UI rows. */
  onPlatformSettlementShort:
    "You receive the service price. Booking protection is customer-paid and retained by Beautonomi.",
} as const;

/** SMS when sharing a public booking link after a walk-in visit. */
export function providerShareBookingLinkSms(link: string): string {
  return `Here’s my booking link to hold your next slot: ${link}`;
}

/** After prepaid/online visit — same HTTPS link, different courtesy line. */
export function providerLockNextShareSms(link: string, prepaidVisit: boolean): string {
  if (prepaidVisit) {
    return `When you're ready to rebook, use this link so your time is held: ${link}`;
  }
  return providerShareBookingLinkSms(link);
}

/** Post cash/walk-in complete — peak-end nudge (one screen, dismissible). */
export function providerPostCashCompleteShareLine(clientName: string): string {
  const who = clientName.trim() || "your client";
  return `Lock ${who}'s next visit by sending your booking link.`;
}

/** After cash no-show / late cancel with no platform payment. */
export function providerNoFeeCashLossLine(clientName: string): string {
  const who = clientName.trim() || "your client";
  return `No fee to keep — this visit wasn't paid on Beautonomi. Send ${who} your booking link so next time a deposit is taken.`;
}

export function providerOnPlatformPaymentNudgeText(): string {
  return PLATFORM_ON_APP_PAYMENT_CLAIMS.onPlatformSettlement;
}
