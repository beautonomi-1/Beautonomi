/**
 * Amplitude Client SDK Initialization
 */

import * as amplitude from "@amplitude/analytics-browser";
import { sessionReplayPlugin } from "@amplitude/plugin-session-replay-browser";
import { applyUserPropertiesToIdentify } from "./identify-helpers";
import { AmplitudeConfig } from "./types";
import { PluginPipeline, PluginContext } from "./plugins";

let pluginPipeline: PluginPipeline | null = null;
let isInitialized = false;
/** Last Session Replay choice used at init; mismatch triggers reset + re-init (e.g. login). */
let lastEnableSessionReplay: boolean | undefined = undefined;

/**
 * Reset browser Amplitude SDK and local pipeline state so init can run again
 * (e.g. after switching anonymous → authenticated session replay policy).
 */
export function hardResetAmplitudeBrowser(): void {
  if (isInitialized || pluginPipeline) {
    // amplitude.reset() emits a spurious "Cannot unregister the default
    // instance" warning in SDK v2 because the default named instance is
    // protected from unregistration in Amplitude's InstanceManager.  We use
    // setUserId(undefined) instead, which clears the current identity without
    // triggering the unregister path, achieving the same effect for our use
    // case (clearing user context before re-init with a new replay policy).
    try {
      amplitude.setUserId(undefined);
    } catch {
      /* ignore */
    }
  }
  pluginPipeline = null;
  isInitialized = false;
  lastEnableSessionReplay = undefined;
}

export interface AmplitudeClient {
  track: (eventName: string, eventProperties?: Record<string, any>) => void;
  identify: (userId: string, userProperties?: Record<string, any>) => void;
  setUserProperties: (userProperties: Record<string, any>) => void;
  reset: () => void;
  isReady: () => boolean;
}

export type InitAmplitudeOptions = {
  /**
   * When false, Session Replay is not loaded (anonymous sessions / no consent).
   * When true, replay uses admin-configured sampling_rate (default 0.01).
   */
  enableSessionReplay?: boolean;
};

/**
 * Initialize Amplitude SDK with config
 */
export async function initAmplitude(
  config: AmplitudeConfig,
  context: PluginContext,
  options?: InitAmplitudeOptions
): Promise<AmplitudeClient | null> {
  const enableSessionReplay = options?.enableSessionReplay ?? true;

  if (isInitialized && pluginPipeline) {
    if (lastEnableSessionReplay === enableSessionReplay) {
      return createClient(pluginPipeline);
    }
    hardResetAmplitudeBrowser();
  }

  if (!config.api_key_public) {
    console.warn("[Amplitude] No API key provided, skipping initialization");
    return null;
  }

  try {
    amplitude.init(config.api_key_public, {
      defaultTracking: {
        pageViews: true,
        sessions: true,
        formInteractions: true,
        fileDownloads: true,
      },
    });

    if (enableSessionReplay) {
      const sampleRate =
        config.sampling_rate != null && config.sampling_rate >= 0 && config.sampling_rate <= 1
          ? config.sampling_rate
          : 0.01;
      // Defer session replay plugin initialization until after the page is
      // interactive.  The plugin eagerly injects <link rel="preload"> tags for
      // its recording-engine workers as soon as it is added to the Amplitude
      // instance.  When initialized synchronously during page load those
      // preloads fire before the browser has consumed them, producing dozens of
      // "preloaded using link preload but not used within a few seconds" console
      // warnings.  Delaying to requestIdleCallback / setTimeout(2 s) moves the
      // preloads outside the browser's load-event tracking window.
      const scheduleReplay = () => {
        amplitude.add(sessionReplayPlugin({ sampleRate }));
      };
      if (typeof window !== "undefined" && typeof (window as any).requestIdleCallback === "function") {
        (window as any).requestIdleCallback(scheduleReplay, { timeout: 4000 });
      } else {
        setTimeout(scheduleReplay, 2000);
      }
    }

    pluginPipeline = new PluginPipeline(context);
    isInitialized = true;
    lastEnableSessionReplay = enableSessionReplay;

    return createClient(pluginPipeline);
  } catch (error) {
    console.error("[Amplitude] Failed to initialize:", error);
    return null;
  }
}

function createClient(pipeline: PluginPipeline): AmplitudeClient {
  return {
    track: async (eventName: string, eventProperties?: Record<string, any>) => {
      try {
        // Process event through pipeline
        const processedEvent = await pipeline.execute({
          event_type: eventName,
          event_properties: eventProperties,
        });

        // Track with Amplitude SDK
        amplitude.track(processedEvent.event_type, processedEvent.event_properties);
      } catch (error) {
        console.error("[Amplitude] Error tracking event:", error);
      }
    },

    identify: (userId: string, userProperties?: Record<string, any>) => {
      try {
        amplitude.setUserId(userId);
        if (userProperties && Object.keys(userProperties).length > 0) {
          const identifyObj = applyUserPropertiesToIdentify(amplitude.Identify, userProperties);
          amplitude.identify(identifyObj);
        }
      } catch (error) {
        console.error("[Amplitude] Error identifying user:", error);
      }
    },

    setUserProperties: (userProperties: Record<string, any>) => {
      try {
        const identifyObj = applyUserPropertiesToIdentify(amplitude.Identify, userProperties);
        amplitude.identify(identifyObj);
      } catch (error) {
        console.error("[Amplitude] Error setting user properties:", error);
      }
    },

    reset: () => {
      try {
        amplitude.reset();
      } catch (error) {
        console.error("[Amplitude] Error resetting:", error);
      }
    },

    isReady: () => isInitialized && !!pluginPipeline,
  };
}

/**
 * Get current Amplitude instance (if initialized)
 */
export function getAmplitudeInstance(): AmplitudeClient | null {
  if (!isInitialized || !pluginPipeline) {
    return null;
  }
  return createClient(pluginPipeline);
}
