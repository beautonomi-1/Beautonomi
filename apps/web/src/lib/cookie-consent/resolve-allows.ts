import type { StoredCookieConsent } from "./types";

/** Amplitude, marketing attribution, session analytics, RUM — optional analytics category. */
export function resolveAllowsAnalytics(args: {
  consentReady: boolean;
  consent: StoredCookieConsent | null;
  hasUser: boolean;
  serverAnalyticsAllowed: boolean | null;
}): boolean {
  const { consentReady, consent, hasUser, serverAnalyticsAllowed } = args;
  if (!consentReady) return false;
  if (!hasUser) {
    return consent?.categories.analytics === true;
  }
  if (serverAnalyticsAllowed === null) return false;
  if (serverAnalyticsAllowed === false) return false;
  if (consent && consent.categories.analytics === false) return false;
  return true;
}

export function resolveAllowsFunctional(consentReady: boolean, consent: StoredCookieConsent | null): boolean {
  if (!consentReady) return false;
  return consent?.categories.functional === true;
}

export function resolveAllowsMarketing(consentReady: boolean, consent: StoredCookieConsent | null): boolean {
  if (!consentReady) return false;
  return consent?.categories.marketing === true;
}
