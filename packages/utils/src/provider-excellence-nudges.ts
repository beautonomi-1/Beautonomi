/**
 * Shared microcopy for provider excellence / retention nudges (web + provider app).
 * Keep tone: identity-building, progress, trust — avoid guilt or spam.
 */

/** localStorage (web) / AsyncStorage key — dismiss hides the dashboard tip for ~7 days */
export const PROVIDER_EXCELLENCE_DASHBOARD_STORAGE_KEY = "beautonomi_provider_excellence_dashboard_tip_v1";
export const PROVIDER_EXCELLENCE_DASHBOARD_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export const PROVIDER_EXCELLENCE_DASHBOARD_TITLE = "Reputation that compounds";

export const PROVIDER_EXCELLENCE_DASHBOARD_BODY =
  "Clients (and the algorithm) reward consistency: keep bookings, messages, and payments on Beautonomi so your history, reviews, and rewards stay in sync. For house calls, use journey → verify arrival → complete here—every step signals reliability and feeds your badge tier.";

export const PROVIDER_EXCELLENCE_DASHBOARD_CTA = "Rewards & badges";

/** sessionStorage key — payment hint dismissed until tab closes */
export function providerBookingPaymentNudgeSessionKey(bookingId: string): string {
  return `beautonomi_provider_booking_pay_nudge_${bookingId}`;
}

export const PROVIDER_HOUSE_CALL_EXCELLENCE_NUDGE =
  "Punctuality, calm communication, and in-app verification build the trust clients remember—and that trust feeds ratings, your rewards tier, and how you surface in search.";

export const PROVIDER_ON_PLATFORM_PAYMENT_NUDGE =
  "Settling here keeps payouts, disputes, and points on one ledger. Off-platform cash doesn’t strengthen the score customers see.";

export const PROVIDER_SALON_CHECKIN_EXCELLENCE_NUDGE =
  "Timely check-ins keep your day accurate and reviews tied to the right visit—small habits that lift your tier over time.";

/** Provider booking detail (mobile/web): at-salon flow summary next to house-call card */
export const PROVIDER_SALON_VISIT_FLOW_EXPLAINER =
  "In-salon visit: confirm the booking if needed, optionally tap Client arrived when they are here, then start and complete the service.";
