/**
 * Route Tracking Hook
 * Tracks page_view events on route changes
 */

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAmplitude } from "@/hooks/useAmplitude";

export function useRouteTracking() {
  const pathname = usePathname();
  const { track, isReady } = useAmplitude();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady || !pathname) return;

    // Skip if pathname hasn't changed
    if (previousPathname.current === pathname) return;

    // Detect portal from route
    let _portal: "client" | "provider" | "admin" = "client";
    if (pathname.startsWith("/provider")) {
      _portal = "provider";
    } else if (pathname.startsWith("/admin")) {
      _portal = "admin";
    }

    // Track page view
    // Note: portal and provider_id are added by the enrichment plugin
    track("page_view", {
      route: pathname,
    });

    previousPathname.current = pathname;
  }, [pathname, isReady, track]);
}
