"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import WebVitalsReporter from "@/components/global/WebVitalsReporter";
import { useCookieConsent } from "@/providers/CookieConsentProvider";

/**
 * RUM / product analytics (web-vitals beacon, Vercel Speed Insights) — gated by analytics consent.
 */
export default function GatedClientAnalytics() {
  const { allowsAnalytics, isReady } = useCookieConsent();
  if (!isReady || !allowsAnalytics) return null;
  return (
    <>
      <WebVitalsReporter />
      {process.env.NODE_ENV === "production" ? <SpeedInsights /> : null}
    </>
  );
}
