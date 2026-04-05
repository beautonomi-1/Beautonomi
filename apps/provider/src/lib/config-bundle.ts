/**
 * Fetch config bundle from backend. Uses backend URL – no auth required for public bundle.
 * On Expo web at localhost:8081/8082 (or when APP_URL unset) we use http://localhost:3000.
 */
import { APP_URL, withWebApiTenantHeaders, DEFAULT_REGION_CURRENCY } from "@/config/public-env";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";

function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const o = window.location.origin;
    if (o === "http://localhost:8081" || o === "http://localhost:8082" || !APP_URL?.trim()) {
      return "http://localhost:3000";
    }
  }
  return APP_URL?.trim() || "http://localhost:3000";
}

export type Platform = "web" | "customer" | "provider";
export type Environment = "production" | "staging" | "development";

export interface ConfigBundleMeta {
  env: Environment;
  platform: Platform;
  version: string | null;
  fetched_at: string;
  active_market_country?: string;
  active_market_source?: string;
  tenant_id?: string;
  tenant_slug?: string;
  tenant_settings_overlay?: Record<string, unknown>;
  tenant_region?: {
    code: string;
    name: string;
    default_currency: string;
    default_language: string;
    timezone: string;
    phone_country_code: string;
    region_id?: string;
  };
  region_settings_public?: Record<string, unknown>;
}

export interface ResolvedFlag {
  enabled: boolean;
  rollout_percent?: number;
  platforms_allowed?: string[] | null;
  roles_allowed?: string[] | null;
  min_app_version?: string | null;
  environments_allowed?: string[] | null;
}

export interface OnDemandModuleConfig {
  enabled: boolean;
  ringtone_asset_path: string | null;
  ring_duration_seconds: number;
  ring_repeat: boolean;
  waiting_screen_timeout_seconds: number;
  provider_accept_window_seconds: number;
  ui_copy: Record<string, unknown>;
}

export interface PublicConfigBundle {
  meta: ConfigBundleMeta;
  amplitude: Record<string, unknown>;
  third_party: Record<string, unknown>;
  branding: Record<string, unknown>;
  flags: Record<string, ResolvedFlag>;
  modules: {
    on_demand: OnDemandModuleConfig;
    ai: Record<string, unknown>;
    ads: Record<string, unknown>;
    ranking: Record<string, unknown>;
    distance: Record<string, unknown>;
    sumsub: Record<string, unknown>;
    aura: Record<string, unknown>;
    safety: Record<string, unknown>;
  };
}

let cached: PublicConfigBundle | null = null;
let cacheTime = 0;
const CACHE_MS = 5 * 60 * 1000; // 5 min

export async function fetchConfigBundle(params?: {
  platform?: Platform;
  environment?: Environment;
  appVersion?: string | null;
}): Promise<PublicConfigBundle> {
  const platform = params?.platform ?? "provider";
  const environment = params?.environment ?? (__DEV__ ? "development" : "production");
  if (cached && Date.now() - cacheTime < CACHE_MS) {
    return cached;
  }
  const base = getBackendUrl().replace(/\/$/, "");
  const url = `${base}/api/public/config-bundle?platform=${platform}&environment=${environment}`;
  try {
    const res = await fetch(
      url,
      withWebApiTenantHeaders({
        headers: { "X-Active-Market-Country": getDeviceRegionCountryIso() },
      }),
    );
    const data = (await res.json()) as PublicConfigBundle;
    if (data?.meta) {
      cached = data;
      cacheTime = Date.now();
      return data;
    }
  } catch {
    // fallback
  }
  cached = {
    meta: { env: environment, platform, version: null, fetched_at: new Date().toISOString() },
    amplitude: {},
    third_party: {},
    branding: {},
    flags: {},
    modules: {
      on_demand: {
        enabled: false,
        ringtone_asset_path: null,
        ring_duration_seconds: 20,
        ring_repeat: true,
        waiting_screen_timeout_seconds: 45,
        provider_accept_window_seconds: 30,
        ui_copy: {},
      },
      ai: {},
      ads: {},
      ranking: {},
      distance: {},
      sumsub: {},
      aura: {},
      safety: {},
    },
  };
  cacheTime = Date.now();
  return cached as PublicConfigBundle;
}

export function getCachedConfigBundle(): PublicConfigBundle | null {
  return cached;
}

export function getTenantDefaultCurrency(): string {
  const fromBundle = getCachedConfigBundle()?.meta?.tenant_region?.default_currency?.trim();
  if (fromBundle) return fromBundle;
  return DEFAULT_REGION_CURRENCY;
}

export function clearConfigBundleCache(): void {
  cached = null;
  cacheTime = 0;
}
