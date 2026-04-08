"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureMarketingAttributionFromUrl } from "@/lib/analytics/amplitude/marketing-attribution";
import { useCookieConsent } from "@/providers/CookieConsentProvider";

/**
 * Records UTM / click IDs on every navigation so enrichment can attach them to events.
 */
export default function MarketingAttributionCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { allowsAnalytics, isReady } = useCookieConsent();

  useEffect(() => {
    if (!isReady || !allowsAnalytics) return;
    captureMarketingAttributionFromUrl();
  }, [pathname, searchParams, isReady, allowsAnalytics]);

  return null;
}
