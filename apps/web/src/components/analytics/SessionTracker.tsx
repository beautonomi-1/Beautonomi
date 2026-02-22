"use client";

import { useEffect, useRef } from "react";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_SESSION_START, EVENT_SESSION_END } from "@/lib/analytics/amplitude/types";

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
      track(EVENT_SESSION_START, {
        referrer: typeof document !== "undefined" ? document.referrer : undefined,
        utm_source: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("utm_source") : undefined,
        utm_campaign: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("utm_campaign") : undefined,
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
