"use client";

import { useEffect, useState, ReactNode } from "react";
import { useAmplitudeContext } from "@/providers/AmplitudeProvider";

/**
 * Amplitude Surveys Provider
 * Conditionally loads Surveys SDK if enabled in config
 * 
 * Note: Requires @amplitude/surveys SDK to be installed separately
 * npm install @amplitude/surveys
 */
export default function AmplitudeSurveysProvider({ children }: { children: ReactNode }) {
  const { config, isInitialized } = useAmplitudeContext();
  const [_surveysLoaded, setSurveysLoaded] = useState(false);

  useEffect(() => {
    if (!isInitialized || !config?.surveys_enabled || !config?.api_key_public) {
      return;
    }

    // Check if Surveys SDK is available
    if (typeof window === "undefined") return;

    // Load Surveys SDK script
    const script = document.createElement("script");
    script.src = "https://cdn.amplitude.com/libs/surveys-browser-1.0.0-min.js.gz";
    script.async = true;
    script.onload = () => {
      try {
        // Initialize Surveys SDK
        // @ts-ignore - Surveys SDK types may not be available
        if (window.AmplitudeSurveys) {
          // @ts-ignore
          window.AmplitudeSurveys.init({
            apiKey: config.api_key_public,
          });
          setSurveysLoaded(true);
        }
      } catch (error) {
        console.error("[Amplitude Surveys] Failed to initialize:", error);
      }
    };
    script.onerror = () => {
      console.error("[Amplitude Surveys] Failed to load SDK");
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
