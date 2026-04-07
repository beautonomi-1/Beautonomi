/**
 * Synchronous consent reads from persisted storage (no React context).
 * Use when a module cannot access `CookieConsentProvider` (e.g. `AuthProvider` sits above it)
 * or for defense-in-depth inside analytics helpers.
 */

import { readStoredConsent } from "./storage";
import {
  resolveAllowsAnalytics,
  resolveAllowsFunctional,
  resolveAllowsMarketing,
} from "./resolve-allows";

/** Functional / preference cookies & similar storage (e.g. locale, saved location, dismiss state). */
export function readAllowsFunctionalFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  return resolveAllowsFunctional(true, readStoredConsent());
}

/** Analytics & measurement (Amplitude, RUM, attribution persistence). */
export function readAllowsAnalyticsFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  return resolveAllowsAnalytics({
    consentReady: true,
    consent: readStoredConsent(),
    hasUser: false,
    serverAnalyticsAllowed: null,
  });
}

/** Marketing / targeting (ad pixels, promo tags). */
export function readAllowsMarketingFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  return resolveAllowsMarketing(true, readStoredConsent());
}
