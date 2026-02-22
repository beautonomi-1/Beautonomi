/**
 * Amplitude Client SDK Initialization
 */

import * as amplitude from "@amplitude/analytics-browser";
import { AmplitudeConfig } from "./types";
import { PluginPipeline, PluginContext } from "./plugins";

let pluginPipeline: PluginPipeline | null = null;
let isInitialized = false;

export interface AmplitudeClient {
  track: (eventName: string, eventProperties?: Record<string, any>) => void;
  identify: (userId: string, userProperties?: Record<string, any>) => void;
  setUserProperties: (userProperties: Record<string, any>) => void;
  reset: () => void;
  isReady: () => boolean;
}

/**
 * Initialize Amplitude SDK with config
 */
export async function initAmplitude(
  config: AmplitudeConfig,
  context: PluginContext
): Promise<AmplitudeClient | null> {
  if (isInitialized && pluginPipeline) {
    return createClient(pluginPipeline);
  }

  if (!config.api_key_public) {
    console.warn("[Amplitude] No API key provided, skipping initialization");
    return null;
  }

  try {
    // Initialize Amplitude SDK
    amplitude.init(config.api_key_public, {
      defaultTracking: {
        pageViews: false, // We'll track page views manually
        sessions: false, // We'll track sessions manually
        formInteractions: false,
        fileDownloads: false,
      },
    });

    // Create plugin pipeline
    pluginPipeline = new PluginPipeline(context);

    isInitialized = true;

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
        if (userProperties) {
          const identify = new amplitude.Identify();
          Object.entries(userProperties).forEach(([key, value]) => {
            identify.set(key, value);
          });
          amplitude.identify(identify);
        }
      } catch (error) {
        console.error("[Amplitude] Error identifying user:", error);
      }
    },

    setUserProperties: (userProperties: Record<string, any>) => {
      try {
        const identify = new amplitude.Identify();
        Object.entries(userProperties).forEach(([key, value]) => {
          identify.set(key, value);
        });
        amplitude.identify(identify);
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
