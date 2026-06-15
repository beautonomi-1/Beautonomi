/**
 * Web-only entry: same API as react-native.ts but never loads the Engagement plugin.
 * Avoids getEnforcing/useSyncExternalStore crash (React 19 + Metro) from @amplitude/plugin-engagement-react-native.
 */

import * as amplitude from "@amplitude/analytics-react-native";
import type { AmplitudeConfig } from "./types";
import { applyUserPropertiesToIdentify } from "./identify-helpers";

/** Web shim: minimal context when customer/provider run in Expo web. */
export function getMobileAnalyticsAttribution(): Record<string, string> {
  return { platform: "web", device_type: "web", app_version: "expo-web" };
}

export async function captureMarketingAttributionFromUrl(_url?: string | null): Promise<void> {}

export async function refreshMarketingAttributionCache(): Promise<void> {}

export function getCachedMarketingForEvents(): Record<string, string> {
  return {};
}

export function getCachedFirstTouchForIdentify(): Record<string, string> {
  return {};
}

let isInitialized = false;

export interface AnalyticsClient {
  track: (eventType: string, eventProperties?: Record<string, unknown>) => void;
  identify: (userId: string, userProperties?: Record<string, unknown>) => void;
  screen: (screenName: string) => void;
  reset: () => void;
}

export function resetAnalyticsModule(): void {
  isInitialized = false;
  try {
    amplitude.reset();
  } catch {}
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
          const identifyObj = applyUserPropertiesToIdentify(amplitude.Identify, userProperties);
          amplitude.identify(identifyObj);
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
