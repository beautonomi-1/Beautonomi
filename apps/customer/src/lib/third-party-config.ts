/**
 * Fetch third-party config (Mapbox, OneSignal, etc.) from backend.
 * Uses public API – no auth required.
 */
import { getBackendUrl, withWebApiTenantHeaders } from "@/config/public-env";

export interface MapboxConfig {
  public_token: string;
  enabled: boolean;
  /** Optional style URL from superadmin (e.g. mapbox://styles/mapbox/streets-v12). Used for maps and static images. */
  style_url?: string;
}

export interface ThirdPartyConfig {
  mapbox?: MapboxConfig;
  onesignal?: { app_id: string; enabled: boolean };
  social_auth?: { google: boolean; apple: boolean };
}

let cachedConfig: ThirdPartyConfig | null = null;

export async function getThirdPartyConfig(
  service?: "mapbox" | "onesignal" | "social_auth",
  options?: { app?: "customer" | "provider" },
): Promise<ThirdPartyConfig> {
  if (cachedConfig && !service) return cachedConfig;

  const origin = getBackendUrl().trim().replace(/\/$/, "");
  if (!origin) {
    return {} as ThirdPartyConfig;
  }

  const params = new URLSearchParams();
  if (service) params.set("service", service);
  if (options?.app) params.set("app", options.app);

  const url = `${origin}/api/public/third-party-config${params.toString() ? `?${params.toString()}` : ""}`;

  try {
    const res = await fetch(url, withWebApiTenantHeaders());
    const json = await res.json().catch(() => ({}));
    const data = json.data ?? {};

    if (!service) {
      cachedConfig = data;
    }
    return data;
  } catch {
    return {} as ThirdPartyConfig;
  }
}

export async function getMapboxToken(): Promise<string | null> {
  const cfg = await getMapboxConfig();
  return cfg?.token ?? null;
}

/** Mapbox client config (token + optional style). Aligned with web; source: superadmin Mapbox config. */
export async function getMapboxConfig(): Promise<{ token: string; style_url?: string } | null> {
  const data = await getThirdPartyConfig("mapbox");
  const mapbox = (data as Record<string, unknown>)?.mapbox ?? data;
  const cfg = mapbox as { public_token?: string; style_url?: string; enabled?: boolean };
  if (cfg?.enabled !== false && cfg?.public_token) {
    return { token: cfg.public_token, style_url: cfg.style_url };
  }
  return null;
}

/** OneSignal app_id from superadmin – customer mobile app (must match server sends with appType customer). */
export async function getOneSignalAppId(): Promise<string | null> {
  const data = await getThirdPartyConfig("onesignal", { app: "customer" });
  const onesignal = (data as Record<string, unknown>)?.onesignal ?? data;
  const cfg = onesignal as { enabled?: boolean; app_id?: string };
  return cfg?.enabled && cfg?.app_id ? cfg.app_id : null;
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
