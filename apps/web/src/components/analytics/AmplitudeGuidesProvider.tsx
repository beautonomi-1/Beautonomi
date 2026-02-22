"use client";

import { useEffect, useState, ReactNode } from "react";
import { useAmplitudeContext } from "@/providers/AmplitudeProvider";

/**
 * Amplitude Guides Provider
 * Conditionally loads Guides SDK if enabled in config
 * 
 * Note: Requires @amplitude/guides SDK to be installed separately
 * npm install @amplitude/guides
 */
export default function AmplitudeGuidesProvider({ children }: { children: ReactNode }) {
  const { config, isInitialized } = useAmplitudeContext();
  const [_guidesLoaded, setGuidesLoaded] = useState(false);

  useEffect(() => {
    if (!isInitialized || !config?.guides_enabled || !config?.api_key_public) {
      return;
    }

    // Check if Guides SDK is available
    if (typeof window === "undefined") return;

    // Load Guides SDK script
    const script = document.createElement("script");
    script.src = "https://cdn.amplitude.com/libs/guides-browser-1.0.0-min.js.gz";
    script.async = true;
    script.onload = () => {
      try {
        // Initialize Guides SDK
        // @ts-ignore - Guides SDK types may not be available
        if (window.AmplitudeGuides) {
          // @ts-ignore
          window.AmplitudeGuides.init({
            apiKey: config.api_key_public,
          });
          setGuidesLoaded(true);
        }
      } catch (error) {
        console.error("[Amplitude Guides] Failed to initialize:", error);
      }
    };
    script.onerror = () => {
      console.error("[Amplitude Guides] Failed to load SDK");
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [config, isInitialized]);

  return <>{children}</>;
}
