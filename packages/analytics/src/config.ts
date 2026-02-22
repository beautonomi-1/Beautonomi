/**
 * Fetch Amplitude config from public API - works for web + RN (pass baseUrl for RN)
 */

import type { AmplitudeConfig } from "./types";

let cachedConfig: AmplitudeConfig | null = null;
let configFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchAmplitudeConfig(
  baseUrl: string = "",
  environment: "production" | "staging" | "development" = "production"
): Promise<AmplitudeConfig> {
  const now = Date.now();
  if (cachedConfig && now - configFetchTime < CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const url = `${baseUrl.replace(/\/$/, "")}/api/public/analytics-config?environment=${environment}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
    const config = await res.json();
    cachedConfig = config;
    configFetchTime = now;
    return config;
  } catch {
    return {
      api_key_public: null,
      environment,
      enabled_client_portal: false,
      enabled_provider_portal: false,
      enabled_admin_portal: false,
      guides_enabled: false,
      surveys_enabled: false,
      sampling_rate: 1,
      debug_mode: false,
    };
  }
}

export function clearAmplitudeConfigCache() {
  cachedConfig = null;
  configFetchTime = 0;
}
