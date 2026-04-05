/**
 * Amplitude analytics for React Native / Expo.
 * Uses remote config from /api/public/analytics-config.
 * When guides_enabled or surveys_enabled, adds the Engagement plugin (Guides & Surveys)
 * and exports handleEngagementURL / bootEngagement for deep links and CDP-aligned identity.
 * For web use @beautonomi/analytics/react-native.web to avoid loading this file (engagement plugin causes getEnforcing crash).
 */

import * as amplitude from "@amplitude/analytics-react-native";
import { add as amplitudeAdd } from "@amplitude/analytics-react-native";
import { getPlugin, handleURL as engagementHandleURL } from "@amplitude/plugin-engagement-react-native";
import { SessionReplayPlugin } from "@amplitude/plugin-session-replay-react-native";
import type { AmplitudeConfig } from "./types";

let isInitialized = false;
let currentConfig: AmplitudeConfig | null = null;
let engagementEnabled = false;
/** Last session replay choice; mismatch → reset + re-init (e.g. sign-in). */
let lastEnableSessionReplay: boolean | undefined = undefined;
let lastPortal: "client" | "provider" | null = null;

export interface AnalyticsClient {
  track: (eventType: string, eventProperties?: Record<string, unknown>) => void;
  identify: (userId: string, userProperties?: Record<string, unknown>) => void;
  screen: (screenName: string) => void;
  reset: () => void;
}

export type InitAnalyticsOptions = {
  /**
   * When false, Session Replay is not loaded (anonymous / pre-consent).
   * When true, replay uses admin-configured sampling_rate (0–1, default 0).
   */
  enableSessionReplay?: boolean;
};

/**
 * Initialize Amplitude from remote config.
 * When guides_enabled or surveys_enabled, adds the Engagement plugin (Guides & Surveys).
 * Same API key as web for CDP and consistent analytics.
 */
export async function initAnalytics(
  config: AmplitudeConfig,
  portal: "client" | "provider",
  options?: InitAnalyticsOptions
): Promise<AnalyticsClient | null> {
  const enableSessionReplay = options?.enableSessionReplay ?? true;
  const enabled =
    portal === "client" ? config.enabled_client_portal : config.enabled_provider_portal;
  if (!config.api_key_public || !enabled) {
    return null;
  }

  if (
    isInitialized &&
    lastEnableSessionReplay === enableSessionReplay &&
    lastPortal === portal
  ) {
    return createClient();
  }

  if (isInitialized) {
    try {
      amplitude.reset();
    } catch {
      /* ignore */
    }
    isInitialized = false;
    engagementEnabled = false;
    currentConfig = null;
    lastEnableSessionReplay = undefined;
    lastPortal = null;
  }

  try {
    amplitude.init(config.api_key_public);
    isInitialized = true;
    currentConfig = config;
    lastEnableSessionReplay = enableSessionReplay;
    lastPortal = portal;
    engagementEnabled = Boolean(config.guides_enabled || config.surveys_enabled);

    if (enableSessionReplay) {
      const sampleRate =
        config.sampling_rate != null && config.sampling_rate >= 0 && config.sampling_rate <= 1
          ? config.sampling_rate
          : 0;
      try {
        await amplitudeAdd(new SessionReplayPlugin({ sampleRate })).promise;
      } catch (replayErr) {
        console.warn("[Amplitude] Session Replay plugin add failed:", replayErr);
      }
    }

    if (engagementEnabled) {
      try {
        amplitudeAdd(getPlugin());
      } catch (pluginErr) {
        console.warn("[Amplitude] Engagement plugin add failed:", pluginErr);
        engagementEnabled = false;
      }
    }

    return createClient();
  } catch (err) {
    console.warn("[Amplitude] Init failed:", err);
    isInitialized = false;
    lastEnableSessionReplay = undefined;
    lastPortal = null;
    return null;
  }
}

/**
 * Handle a URL (e.g. from Linking). Use for Amplitude guide/survey preview deep links.
 * Returns true if the URL was handled by the Engagement SDK; otherwise the app should handle it.
 */
export async function handleEngagementURL(url: string): Promise<boolean> {
  if (!engagementEnabled || !url) return false;
  try {
    return await engagementHandleURL(url);
  } catch {
    return false;
  }
}

/**
 * Boot the Engagement plugin with the current user (and optional device id).
 * Call after identify so Guides and Surveys can be shown. Required for in-app guides/surveys.
 */
export function bootEngagement(userId: string, deviceId?: string): void {
  if (!engagementEnabled || !userId) return;
  try {
    const plugin = getPlugin();
    if (typeof plugin.boot === "function") {
      plugin.boot(userId, deviceId ?? "");
    }
  } catch {}
}

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
        bootEngagement(userId);
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
  return engagementEnabled;
}
