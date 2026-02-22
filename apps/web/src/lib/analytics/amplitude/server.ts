/**
 * Server-Side Amplitude Tracking
 * Uses Amplitude HTTP API for server-side event tracking.
 * Config is cached in-memory with a 5-minute TTL to avoid
 * querying the database on every track call.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { AmplitudeEvent } from "./types";

const AMPLITUDE_API_ENDPOINT = "https://api2.amplitude.com/2/httpapi";

interface AmplitudeResponse {
  code: number;
  events_ingested?: number;
  events_dropped?: number;
  message?: string;
}

// --- In-memory config cache (5-minute TTL) ---

interface AmplitudeServerConfig {
  api_key_server: string | null;
  ingestion_endpoint: string | null;
}

let cachedConfig: AmplitudeServerConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getCachedConfig(): Promise<AmplitudeServerConfig | null> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: config } = await supabase
      .from("amplitude_integration_config")
      .select("api_key_server, ingestion_endpoint")
      .eq(
        "environment",
        process.env.NODE_ENV === "production" ? "production" : "development"
      )
      .maybeSingle();

    cachedConfig = config ?? null;
    cacheTimestamp = now;
    return cachedConfig;
  } catch (error) {
    console.error("[Amplitude Server] Failed to fetch config:", error);
    // Return stale cache if available, otherwise null
    return cachedConfig;
  }
}

/**
 * Track event server-side using Amplitude HTTP API
 */
export async function trackServer(
  eventName: string,
  properties?: Record<string, any>,
  userId?: string,
  options?: {
    apiKey?: string;
    ingestionEndpoint?: string;
  }
): Promise<void> {
  try {
    const config = await getCachedConfig();

    const apiKey = options?.apiKey || config?.api_key_server || process.env.AMPLITUDE_SERVER_API_KEY;
    const endpoint = options?.ingestionEndpoint || config?.ingestion_endpoint || AMPLITUDE_API_ENDPOINT;

    if (!apiKey) {
      console.warn("[Amplitude Server] No API key configured, skipping event tracking");
      return;
    }

    // Build event payload
    const event: AmplitudeEvent = {
      event_type: eventName,
      user_id: userId,
      event_properties: properties,
      time: Date.now(),
    };

    // Send to Amplitude
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        events: [event],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Amplitude Server] Failed to track event:", {
        status: response.status,
        error: errorData,
      });
      return;
    }

    const data: AmplitudeResponse = await response.json();
    
    if (data.code !== 200) {
      console.error("[Amplitude Server] Amplitude API error:", data);
    }
  } catch (error) {
    console.error("[Amplitude Server] Error tracking event:", error);
    // Don't throw - analytics failures shouldn't break the app
  }
}

/**
 * Track multiple events in a single batch
 */
export async function trackBatch(
  events: Array<{
    eventName: string;
    properties?: Record<string, any>;
    userId?: string;
  }>,
  options?: {
    apiKey?: string;
    ingestionEndpoint?: string;
  }
): Promise<void> {
  try {
    const config = await getCachedConfig();

    const apiKey = options?.apiKey || config?.api_key_server || process.env.AMPLITUDE_SERVER_API_KEY;
    const endpoint = options?.ingestionEndpoint || config?.ingestion_endpoint || AMPLITUDE_API_ENDPOINT;

    if (!apiKey) {
      console.warn("[Amplitude Server] No API key configured, skipping batch tracking");
      return;
    }

    // Build events payload
    const amplitudeEvents: AmplitudeEvent[] = events.map(({ eventName, properties, userId }) => ({
      event_type: eventName,
      user_id: userId,
      event_properties: properties,
      time: Date.now(),
    }));

    // Send to Amplitude
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        events: amplitudeEvents,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Amplitude Server] Failed to track batch:", {
        status: response.status,
        error: errorData,
      });
      return;
    }

    const data: AmplitudeResponse = await response.json();
    
    if (data.code !== 200) {
      console.error("[Amplitude Server] Amplitude API error:", data);
    }
  } catch (error) {
    console.error("[Amplitude Server] Error tracking batch:", error);
    // Don't throw - analytics failures shouldn't break the app
  }
}
