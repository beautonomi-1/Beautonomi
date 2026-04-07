/**
 * First-touch + session marketing parameters for Amplitude (campaigns, paid social, etc.).
 * Persists first-touch in localStorage; session params in sessionStorage.
 * Reads/writes are gated by **analytics** consent (`readAllowsAnalyticsFromStorage`).
 */

import { readAllowsAnalyticsFromStorage } from "@/lib/cookie-consent/guards";

const LS_FIRST = "beautonomi_mkt_first_v1";
const SS_SESSION = "beautonomi_mkt_session_v1";

/** Params commonly used for acquisition and paid attribution (non-PII). */
export const MARKETING_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "msclkid",
  "twclid",
  "li_fat_id",
] as const;

function parseParamsFromSearch(search: string): Record<string, string> {
  const found: Record<string, string> = {};
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    for (const k of MARKETING_PARAM_KEYS) {
      const v = params.get(k);
      if (v?.trim()) found[k] = v.trim().slice(0, 500);
    }
  } catch {
    /* ignore */
  }
  return found;
}

/**
 * Call on each navigation (or once on load). Captures URL params into session + first-touch.
 */
export function captureMarketingAttributionFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const found = parseParamsFromSearch(window.location.search);
    if (Object.keys(found).length === 0) return;

    sessionStorage.setItem(SS_SESSION, JSON.stringify(found));

    const firstRaw = localStorage.getItem(LS_FIRST);
    if (!firstRaw || firstRaw === "{}") {
      localStorage.setItem(LS_FIRST, JSON.stringify(found));
    }
  } catch {
    /* ignore */
  }
}

/** Merged into every Amplitude event (enrichment) — first + session scopes. */
export function getMarketingAttributionForEvents(): Record<string, string> {
  if (typeof window === "undefined") return {};
  if (!readAllowsAnalyticsFromStorage()) return {};
  try {
    const out: Record<string, string> = {};
    const first = JSON.parse(localStorage.getItem(LS_FIRST) || "{}") as Record<string, string>;
    const session = JSON.parse(sessionStorage.getItem(SS_SESSION) || "{}") as Record<string, string>;
    for (const k of MARKETING_PARAM_KEYS) {
      if (first[k]) out[`mkt_first_${k}`] = first[k];
      if (session[k]) out[`mkt_session_${k}`] = session[k];
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * First-touch keys for POST /api/me/analytics/identify (user cohorts in Amplitude).
 */
export function getFirstTouchForIdentify(): Record<string, string> {
  if (typeof window === "undefined") return {};
  if (!readAllowsAnalyticsFromStorage()) return {};
  try {
    const first = JSON.parse(localStorage.getItem(LS_FIRST) || "{}") as Record<string, string>;
    const out: Record<string, string> = {};
    const map: Record<string, string> = {
      utm_source: "first_touch_utm_source",
      utm_medium: "first_touch_utm_medium",
      utm_campaign: "first_touch_utm_campaign",
      utm_term: "first_touch_utm_term",
      utm_content: "first_touch_utm_content",
      gclid: "first_touch_gclid",
      fbclid: "first_touch_fbclid",
      msclkid: "first_touch_msclkid",
    };
    for (const [src, dest] of Object.entries(map)) {
      if (first[src]) out[dest] = first[src].slice(0, 500);
    }
    return out;
  } catch {
    return {};
  }
}
