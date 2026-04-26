/**
 * Fetch third-party config (OneSignal, Mapbox, etc.) from backend.
 * Uses public API – no auth required.
 */
import { APP_URL, withWebApiTenantHeaders } from "@/config/public-env";

export interface ThirdPartyConfig {
  onesignal?: { app_id: string; enabled: boolean };
  mapbox?: { public_token: string; style_url?: string };
  social_auth?: { google: boolean; apple: boolean };
}

let cachedConfig: ThirdPartyConfig | null = null;

export async function getThirdPartyConfig(
  service?: "onesignal" | "mapbox" | "social_auth",
  options?: { app?: "customer" | "provider" },
): Promise<ThirdPartyConfig> {
  if (cachedConfig && !service) return cachedConfig;

  const params = new URLSearchParams();
  if (service) params.set("service", service);
  if (options?.app) params.set("app", options.app);
  const url = `${APP_URL}/api/public/third-party-config${params.toString() ? `?${params.toString()}` : ""}`;

  try {
    const res = await fetch(url, withWebApiTenantHeaders());
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

/** OneSignal app_id for the provider app (uses provider app when using two OneSignal apps). */
export async function getOneSignalAppId(): Promise<string | null> {
  const data = await getThirdPartyConfig("onesignal", { app: "provider" });
  const onesignal = (data as Record<string, unknown>)?.onesignal ?? data;
  const cfg = onesignal as { enabled?: boolean; app_id?: string };
  return cfg?.enabled && cfg?.app_id ? cfg.app_id : null;
}

let mapboxConfigCache: { token: string; style_url?: string } | null = null;

export async function getMapboxToken(): Promise<string | null> {
  const cfg = await getMapboxConfig();
  return cfg?.token ?? null;
}

/** Mapbox client config (token + optional style). Aligned with web and customer app; source: superadmin Mapbox config. */
export async function getMapboxConfig(): Promise<{ token: string; style_url?: string } | null> {
  if (mapboxConfigCache) return mapboxConfigCache;
  try {
    const data = await getThirdPartyConfig("mapbox");
    const mapbox = (data as Record<string, unknown>)?.mapbox ?? data;
    const cfg = mapbox as { public_token?: string; style_url?: string; enabled?: boolean };
    if (cfg?.enabled !== false && cfg?.public_token) {
      mapboxConfigCache = { token: cfg.public_token, style_url: cfg.style_url };
      return mapboxConfigCache;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSocialAuthConfig(): Promise<{ google: boolean; apple: boolean }> {
  const data = await getThirdPartyConfig("social_auth");
  const social = (data as Record<string, unknown>)?.social_auth ?? data;
  const cfg = social as { google?: boolean; apple?: boolean };
  return {
    google: cfg?.google !== false,
    apple: cfg?.apple !== false,
  };
}
