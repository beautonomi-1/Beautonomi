"use client";

import { useEffect, useRef } from "react";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_SESSION_START, EVENT_SESSION_END } from "@/lib/analytics/amplitude/types";
import { getMarketingAttributionForEvents } from "@/lib/analytics/amplitude/marketing-attribution";

/**
 * Tracks session_start and session_end events
 */
export default function SessionTracker() {
  const { track, isReady } = useAmplitude();
  const sessionStartTime = useRef<number>(Date.now());
  const hasTrackedStart = useRef(false);

  useEffect(() => {
    if (!isReady) return;

    // Track session start (only once)
    if (!hasTrackedStart.current) {
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      track(EVENT_SESSION_START, {
        referrer: typeof document !== "undefined" ? document.referrer : undefined,
        utm_source: params?.get("utm_source") ?? undefined,
        utm_medium: params?.get("utm_medium") ?? undefined,
        utm_campaign: params?.get("utm_campaign") ?? undefined,
        utm_term: params?.get("utm_term") ?? undefined,
        utm_content: params?.get("utm_content") ?? undefined,
        utm_id: params?.get("utm_id") ?? undefined,
        gclid: params?.get("gclid") ?? undefined,
        fbclid: params?.get("fbclid") ?? undefined,
        msclkid: params?.get("msclkid") ?? undefined,
        ...getMarketingAttributionForEvents(),
      });
      hasTrackedStart.current = true;
    }

    // Track session end on page unload
    const handleBeforeUnload = () => {
      const sessionDuration = Date.now() - sessionStartTime.current;
      track(EVENT_SESSION_END, {
        session_duration_ms: sessionDuration,
      });
    };

    // Track session end on visibility change (tab hidden)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const sessionDuration = Date.now() - sessionStartTime.current;
        track(EVENT_SESSION_END, {
          session_duration_ms: sessionDuration,
        });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isReady, track]);

  return null;
}
