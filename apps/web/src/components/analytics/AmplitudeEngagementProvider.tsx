"use client";

import { useEffect, useRef, ReactNode } from "react";
import * as amplitude from "@amplitude/analytics-browser";
import { useAmplitudeContext } from "@/providers/AmplitudeProvider";

let engagementPluginRegistered = false;

/**
 * Registers Amplitude Guides & Surveys via the official engagement plugin (bundled).
 * Avoids CDN script tags that can 401/403 or fail under ad blockers.
 * @see https://amplitude.com/docs/guides-and-surveys/sdk
 */
export default function AmplitudeEngagementProvider({ children }: { children: ReactNode }) {
  const { config, isInitialized } = useAmplitudeContext();
  const pluginAttached = useRef(false);

  useEffect(() => {
    if (!isInitialized || !config?.api_key_public || (!config.surveys_enabled && !config.guides_enabled)) {
      return;
    }

    if (typeof window === "undefined") return;

    let cancelled = false;

    import("@amplitude/engagement-browser")
      .then(({ plugin: engagementPlugin }) => {
        if (cancelled || pluginAttached.current || engagementPluginRegistered) return;
        try {
          amplitude.add(engagementPlugin());
          pluginAttached.current = true;
          engagementPluginRegistered = true;
        } catch {
          /* ignore — optional product surface */
        }
      })
      .catch(() => {
        /* ignore — optional product surface */
      });

    return () => {
      cancelled = true;
    };
  }, [config, isInitialized]);

  return <>{children}</>;
}
