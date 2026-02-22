"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { useOneSignal } from "@/hooks/useOneSignal";

// Track if we've already warned about missing App ID (module-level to persist across renders)
let hasWarnedAboutAppId = false;

/**
 * Client component to register devices with OneSignal
 * 
 * This should be included in authenticated layouts
 */
export default function OneSignalProvider() {
  // Call the hook - it will wait for OneSignal to be available
  useOneSignal();
  const hasWarnedRef = useRef(false);

  // Only load OneSignal if we have an app ID
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  
  // Warn only once about missing App ID
  useEffect(() => {
    if (!appId && !hasWarnedAboutAppId && !hasWarnedRef.current && process.env.NODE_ENV === "development") {
      console.warn("OneSignal App ID not configured. Set NEXT_PUBLIC_ONESIGNAL_APP_ID environment variable.");
      hasWarnedAboutAppId = true;
      hasWarnedRef.current = true;
    }
  }, [appId]);
  
  if (!appId) {
    return null;
  }

  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
      onLoad={() => {
        if (process.env.NODE_ENV === "development") {
          console.log("OneSignal SDK loaded successfully");
        }
      }}
      onError={() => {
        console.error("Failed to load OneSignal SDK");
      }}
    />
  );
}
