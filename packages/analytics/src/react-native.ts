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
import type { AmplitudeConfig } from "./types";
import { applyUserPropertiesToIdentify } from "./identify-helpers";
import { getMobileAnalyticsAttribution } from "./mobile-attribution";
import {
  captureMarketingAttributionFromUrl,
  refreshMarketingAttributionCache,
  getCachedMarketingForEvents,
  getCachedFirstTouchForIdentify,
} from "./marketing-attribution-native";

export { getMobileAnalyticsAttribution };
export {
  captureMarketingAttributionFromUrl,
  refreshMarketingAttributionCache,
  getCachedMarketingForEvents,
  getCachedFirstTouchForIdentify,
};

let isInitialized = false;
let currentConfig: AmplitudeConfig | null = null;
let engagementEnabled = false;
let lastBootedEngagementUserId: string | null = null;
let lastPortal: "client" | "provider" | null = null;
/** Ignores stale in-flight init when auth/bootstrap races (anonymous → signed-in). */
let initGeneration = 0;
/**
 * Process-lifetime flag: `amplitude.reset()` clears identity but leaves the native
 * plugin registry intact, so the Engagement plugin can only ever be added once per
 * JS runtime. Re-adding it makes Amplitude log "Plugin with name
 * AmplitudeEngagementPlugin already exists, skipping registration" — deliberately
 * never cleared by the reset helpers below.
 */
let engagementPluginAddedForProcess = false;

/** Full module reset — call from AnalyticsProvider cleanup on sign-out / remount. */
export function resetAnalyticsModule(): void {
  initGeneration += 1;
  clearAnalyticsModuleState();
}

function clearAnalyticsModuleState(): void {
  try {
    amplitude.reset();
  } catch {
    /* ignore */
  }
  isInitialized = false;
  currentConfig = null;
  engagementEnabled = false;
  lastBootedEngagementUserId = null;
  lastPortal = null;
}

/** Merged into every track / screen for cross-device funnels (non-PII). */
let cachedEventAttribution: Record<string, string> | null = null;
function getCachedEventAttribution(): Record<string, string> {
  if (!cachedEventAttribution) {
    try {
      cachedEventAttribution = getMobileAnalyticsAttribution();
    } catch {
      cachedEventAttribution = {};
    }
  }
  return cachedEventAttribution;
}

export interface AnalyticsClient {
  track: (eventType: string, eventProperties?: Record<string, unknown>) => void;
  identify: (userId: string, userProperties?: Record<string, unknown>) => void;
  setGroup: (groupType: string, groupName: string) => void;
  screen: (screenName: string) => void;
  reset: () => void;
  /** Force-send queued events (call on AppState background so short sessions are not lost). */
  flush: () => void;
}

/**
 * Initialize Amplitude from remote config.
 * When guides_enabled or surveys_enabled, adds the Engagement plugin (Guides & Surveys).
 * Same API key as web for CDP and consistent analytics.
 */
export async function initAnalytics(
  config: AmplitudeConfig,
  portal: "client" | "provider"
): Promise<AnalyticsClient | null> {
  const enabled =
    portal === "client" ? config.enabled_client_portal : config.enabled_provider_portal;
  if (!config.api_key_public || !enabled) {
    return null;
  }

  const generation = ++initGeneration;

  if (
    isInitialized &&
    lastPortal === portal
  ) {
    try {
      await refreshMarketingAttributionCache();
    } catch {
      /* ignore */
    }
    return createClient();
  }

  if (isInitialized) {
    clearAnalyticsModuleState();
  }

  try {
    amplitude.init(config.api_key_public);
    if (generation !== initGeneration) {
      return null;
    }
    isInitialized = true;
    currentConfig = config;
    lastPortal = portal;
    engagementEnabled = Boolean(config.guides_enabled || config.surveys_enabled);

    if (generation !== initGeneration) {
      return null;
    }

    if (engagementEnabled && !engagementPluginAddedForProcess) {
      try {
        amplitudeAdd(getPlugin());
        engagementPluginAddedForProcess = true;
      } catch (pluginErr) {
        const msg = pluginErr instanceof Error ? pluginErr.message : String(pluginErr);
        if (!/already initialized/i.test(msg)) {
          console.warn("[Amplitude] Engagement plugin add failed:", pluginErr);
        }
        engagementEnabled = false;
      }
    }

    try {
      await refreshMarketingAttributionCache();
    } catch {
      /* ignore */
    }

    if (generation !== initGeneration) {
      return null;
    }

    return createClient();
  } catch (err) {
    console.warn("[Amplitude] Init failed:", err);
    clearAnalyticsModuleState();
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
  if (lastBootedEngagementUserId === userId) return;
  try {
    const plugin = getPlugin();
    if (typeof plugin.boot === "function") {
      // Boot with the Amplitude device id so Guides & Surveys share the same
      // identity as Analytics (CDP-aligned cross-device targeting). Fall back to
      // an empty string only if the SDK has not assigned one yet.
      let resolvedDeviceId = deviceId;
      if (!resolvedDeviceId) {
        try {
          resolvedDeviceId = amplitude.getDeviceId();
        } catch {
          resolvedDeviceId = undefined;
        }
      }
      plugin.boot(userId, resolvedDeviceId ?? "");
      lastBootedEngagementUserId = userId;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already initialized/i.test(msg)) {
      lastBootedEngagementUserId = userId;
    }
  }
}

function createClient(): AnalyticsClient {
  return {
    track: (eventType: string, eventProperties?: Record<string, unknown>) => {
      if (!isInitialized) return;
      try {
        const merged = {
          ...getCachedEventAttribution(),
          ...getCachedMarketingForEvents(),
          ...eventProperties,
        } as Record<string, any>;
        amplitude.track(eventType, merged);
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
        bootEngagement(userId);
      } catch {}
    },
    setGroup: (groupType: string, groupName: string) => {
      if (!isInitialized) return;
      try {
        amplitude.setGroup(groupType, groupName);
      } catch {}
    },
    screen: (screenName: string) => {
      if (!isInitialized) return;
      try {
        amplitude.track("$screen_view", {
          ...getCachedEventAttribution(),
          ...getCachedMarketingForEvents(),
          $screen_name: screenName,
        } as Record<string, any>);
      } catch {}
    },
    reset: () => {
      try {
        amplitude.reset();
      } catch {}
      lastBootedEngagementUserId = null;
    },
    flush: () => {
      if (!isInitialized) return;
      try {
        void amplitude.flush();
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
