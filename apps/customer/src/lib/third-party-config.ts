/**
 * Fetch third-party config (Mapbox, OneSignal, etc.) from backend.
 * Uses public API – no auth required.
 */
import { APP_URL, withWebApiTenantHeaders } from "@/config/public-env";

export interface MapboxConfig {
  public_token: string;
  enabled: boolean;
  /** Optional style URL from superadmin (e.g. mapbox://styles/mapbox/streets-v12). Used for maps and static images. */
  style_url?: string;
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

  const res = await fetch(url, withWebApiTenantHeaders());
  const json = await res.json().catch(() => ({}));
  const data = json.data ?? {};

  if (!service) {
    cachedConfig = data;
  }
  return data;
}

export async function getMapboxToken(): Promise<string | null> {
  const cfg = await getMapboxConfig();
  return cfg?.token ?? null;
}

/** Mapbox client config (token + optional style). Aligned with web; source: superadmin Mapbox config. */
export async function getMapboxConfig(): Promise<{ token: string; style_url?: string } | null> {
  const data = await getThirdPartyConfig("mapbox");
  const mapbox = (data as any)?.mapbox ?? data;
  if (!mapbox?.enabled || !mapbox?.public_token) return null;
  return {
    token: mapbox.public_token,
    style_url: mapbox.style_url,
  };
}

/** OneSignal app_id from superadmin – used by customer mobile app for push notifications */
export async function getOneSignalAppId(): Promise<string | null> {
  const data = await getThirdPartyConfig("onesignal");
  const onesignal = (data as any)?.onesignal ?? data;
  return onesignal?.enabled && onesignal?.app_id ? onesignal.app_id : null;
}
