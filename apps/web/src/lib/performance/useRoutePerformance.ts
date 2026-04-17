"use client";

import { useEffect, useRef } from "react";
import { routeMetrics } from "./route-metrics";

/**
 * Hook that measures time-to-interactive and data-ready timing for a provider
 * portal route.
 *
 * @param routeName  Short identifier (e.g. "calendar", "clients", "dashboard")
 * @param isDataReady  Flip to `true` once the primary dataset is loaded
 *
 * Records:
 *   - `mount-to-data`  Time from component mount to first data paint
 *   - `navigation`     Navigation API timing (if available)
 *
 * @example
 *   useRoutePerformance("dashboard", !isLoading && !!data);
 */
export function useRoutePerformance(
  routeName: string,
  isDataReady: boolean,
): void {
  const mountTime = useRef(performance.now());
  const dataRecorded = useRef(false);

  useEffect(() => {
    mountTime.current = performance.now();
    routeMetrics.mark(routeName, "mount");

    // Capture Navigation Timing if available
    if (typeof window !== "undefined" && performance.getEntriesByType) {
      const [nav] = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      if (nav) {
        routeMetrics.record(
          routeName,
          "dom-interactive",
          nav.domInteractive - nav.startTime,
          "timing",
        );
        routeMetrics.record(
          routeName,
          "dom-content-loaded",
          nav.domContentLoadedEventEnd - nav.startTime,
          "timing",
        );
      }
    }

    return () => {
      routeMetrics.clearRoute(routeName);
    };
    // Only run on mount/unmount
     
  }, [routeName]);

  useEffect(() => {
    if (isDataReady && !dataRecorded.current) {
      dataRecorded.current = true;
      const duration = performance.now() - mountTime.current;
      routeMetrics.record(routeName, "mount-to-data", duration, "timing");
    }
  }, [isDataReady, routeName]);
}
