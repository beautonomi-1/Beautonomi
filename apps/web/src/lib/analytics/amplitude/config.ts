/**
 * Amplitude Config Fetcher
 * Fetches safe public config from API endpoint
 */

import { AmplitudeConfig } from "./types";

let cachedConfig: AmplitudeConfig | null = null;
let configFetchTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch Amplitude configuration from public API
 */
export async function fetchAmplitudeConfig(
  environment: "production" | "staging" | "development" = "production"
): Promise<AmplitudeConfig> {
  const now = Date.now();
  
  // Return cached config if still valid
  if (cachedConfig && now - configFetchTime < CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const response = await fetch(
      `/api/public/analytics-config?environment=${environment}`,
      {
        cache: "no-store", // Always fetch fresh, but we cache in memory
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status}`);
    }

    const config = await response.json();
    
    // Cache the config
    cachedConfig = config;
    configFetchTime = now;
    
    return config;
  } catch (error) {
    console.error("Error fetching Amplitude config:", error);
    
    // Return safe defaults on error
    return {
      api_key_public: null,
      environment,
      enabled_client_portal: false,
      enabled_provider_portal: false,
      enabled_admin_portal: false,
      guides_enabled: false,
      surveys_enabled: false,
      sampling_rate: 1.0,
      debug_mode: false,
    };
  }
}

/**
 * Clear cached config (useful for testing or after config updates)
 */
export function clearAmplitudeConfigCache() {
  cachedConfig = null;
  configFetchTime = 0;
}
