/**
 * Fetch third-party config (OneSignal, Mapbox, etc.) from backend.
 * Uses public API – no auth required.
 */
import { APP_URL } from "@/config/public-env";

export interface ThirdPartyConfig {
  onesignal?: { app_id: string; enabled: boolean };
  mapbox?: { public_token: string };
}

let cachedConfig: ThirdPartyConfig | null = null;

export async function getThirdPartyConfig(
  service?: "onesignal" | "mapbox",
): Promise<ThirdPartyConfig> {
  if (cachedConfig && !service) return cachedConfig;

  const url = service
    ? `${APP_URL}/api/public/third-party-config?service=${service}`
    : `${APP_URL}/api/public/third-party-config`;

  try {
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    const data = json.data ?? {};

    if (!service) {
      cachedConfig = data;
    }
    return data;
  } catch {
    return {};
  }
}

export async function getOneSignalAppId(): Promise<string | null> {
  const data = await getThirdPartyConfig("onesignal");
  const onesignal = (data as Record<string, unknown>)?.onesignal ?? data;
  const cfg = onesignal as { enabled?: boolean; app_id?: string };
  return cfg?.enabled && cfg?.app_id ? cfg.app_id : null;
}

let mapboxTokenCache: string | null = null;

export async function getMapboxToken(): Promise<string | null> {
  if (mapboxTokenCache) return mapboxTokenCache;
  try {
    const data = await getThirdPartyConfig("mapbox");
    const mapbox = (data as Record<string, unknown>)?.mapbox ?? data;
    const cfg = mapbox as { public_token?: string };
    if (cfg?.public_token) {
      mapboxTokenCache = cfg.public_token;
      return cfg.public_token;
    }
    return null;
  } catch {
    return null;
  }
}
