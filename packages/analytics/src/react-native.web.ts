/**
 * Web-only entry: same API as react-native.ts but never loads the Engagement plugin.
 * Avoids getEnforcing/useSyncExternalStore crash (React 19 + Metro) from @amplitude/plugin-engagement-react-native.
 */

import * as amplitude from "@amplitude/analytics-react-native";
import type { AmplitudeConfig } from "./types";

let isInitialized = false;

export interface AnalyticsClient {
  track: (eventType: string, eventProperties?: Record<string, unknown>) => void;
  identify: (userId: string, userProperties?: Record<string, unknown>) => void;
  screen: (screenName: string) => void;
  reset: () => void;
}

export async function initAnalytics(
  config: AmplitudeConfig,
  portal: "client" | "provider"
): Promise<AnalyticsClient | null> {
  const enabled =
    portal === "client" ? config.enabled_client_portal : config.enabled_provider_portal;
  if (!config.api_key_public || !enabled) {
    return null;
  }
  try {
    amplitude.init(config.api_key_public);
    isInitialized = true;
    return createClient();
  } catch (err) {
    console.warn("[Amplitude] Init failed:", err);
    return null;
  }
}

export async function handleEngagementURL(_url: string): Promise<boolean> {
  return false;
}

export function bootEngagement(_userId: string, _deviceId?: string): void {}

function createClient(): AnalyticsClient {
  return {
    track: (eventType: string, eventProperties?: Record<string, unknown>) => {
      if (!isInitialized) return;
      try {
        amplitude.track(eventType, eventProperties as Record<string, any>);
      } catch {}
    },
    identify: (userId: string, userProperties?: Record<string, unknown>) => {
      if (!isInitialized) return;
      try {
        amplitude.setUserId(userId);
        if (userProperties && Object.keys(userProperties).length > 0) {
          const identify = new amplitude.Identify();
          for (const [k, v] of Object.entries(userProperties)) {
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
              identify.set(k, v);
            }
          }
          amplitude.identify(identify);
        }
      } catch {}
    },
    screen: (screenName: string) => {
      if (!isInitialized) return;
      try {
        amplitude.track("$screen_view", { $screen_name: screenName });
      } catch {}
    },
    reset: () => {
      try {
        amplitude.reset();
      } catch {}
    },
  };
}

export function getAnalyticsClient(): AnalyticsClient | null {
  return isInitialized ? createClient() : null;
}

export function isEngagementEnabled(): boolean {
  return false;
}
