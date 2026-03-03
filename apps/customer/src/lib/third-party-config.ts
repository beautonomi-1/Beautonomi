/**
 * Fetch third-party config (Mapbox, OneSignal, etc.) from backend.
 * Uses public API – no auth required.
 */
import { APP_URL } from "@/config/public-env";

export interface MapboxConfig {
  public_token: string;
  enabled: boolean;
}

export interface ThirdPartyConfig {
  mapbox?: MapboxConfig;
  onesignal?: { app_id: string; enabled: boolean };
}

let cachedConfig: ThirdPartyConfig | null = null;

export async function getThirdPartyConfig(
  service?: "mapbox" | "onesignal"
): Promise<ThirdPartyConfig> {
  if (cachedConfig && !service) return cachedConfig;

  const url = service
    ? `${APP_URL}/api/public/third-party-config?service=${service}`
    : `${APP_URL}/api/public/third-party-config`;

  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  const data = json.data ?? {};

  if (!service) {
    cachedConfig = data;
  }
  return data;
}

export async function getMapboxToken(): Promise<string | null> {
  const data = await getThirdPartyConfig("mapbox");
  const mapbox = (data as any)?.mapbox ?? data;
  return mapbox?.enabled && mapbox?.public_token ? mapbox.public_token : null;
}

/** OneSignal app_id from superadmin – used by customer mobile app for push notifications */
export async function getOneSignalAppId(): Promise<string | null> {
  const data = await getThirdPartyConfig("onesignal");
  const onesignal = (data as any)?.onesignal ?? data;
  return onesignal?.enabled && onesignal?.app_id ? onesignal.app_id : null;
}
