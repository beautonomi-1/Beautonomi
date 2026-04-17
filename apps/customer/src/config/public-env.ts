/**
 * Public environment variables for the customer Expo app.
 * EXPO_PUBLIC_* vars are injected at build time from .env / .env.local.
 */
import Constants from "expo-constants";
import { LAST_RESORT_CURRENCY } from "@beautonomi/utils";
import {
  getActiveMarketHostSync,
  initializeActiveMarketHost,
  setActiveMarketHost as setRuntimeActiveMarketHost,
  startActiveMarketHostLinkListener,
} from "@/lib/market/active-market-host";

/** Use dot notation so Expo inlines EXPO_PUBLIC_* at build time (bracket notation is not supported). */
function getEnv(key: string): string {
  const fromProcess =
    key === "EXPO_PUBLIC_SUPABASE_URL"
      ? process.env.EXPO_PUBLIC_SUPABASE_URL
      : key === "EXPO_PUBLIC_SUPABASE_ANON_KEY"
        ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
        : key === "EXPO_PUBLIC_APP_URL"
          ? process.env.EXPO_PUBLIC_APP_URL
          : key === "EXPO_PUBLIC_ONESIGNAL_APP_ID"
            ? process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID
            : key === "EXPO_PUBLIC_IOS_APP_STORE_ID"
              ? process.env.EXPO_PUBLIC_IOS_APP_STORE_ID
              : key === "EXPO_PUBLIC_WEB_API_TENANT_HOST"
                ? process.env.EXPO_PUBLIC_WEB_API_TENANT_HOST
                : key === "EXPO_PUBLIC_GLOBAL_ENTRY_HOST"
                  ? process.env.EXPO_PUBLIC_GLOBAL_ENTRY_HOST
                  : key === "EXPO_PUBLIC_DEFAULT_MARKET_HOST"
                    ? process.env.EXPO_PUBLIC_DEFAULT_MARKET_HOST
                    : key === "EXPO_PUBLIC_MARKET_HOST_OPTIONS"
                      ? process.env.EXPO_PUBLIC_MARKET_HOST_OPTIONS
                      : key === "EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS"
                        ? process.env.EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS
                        : key === "EXPO_PUBLIC_DEFAULT_REGION_CURRENCY"
                        ? process.env.EXPO_PUBLIC_DEFAULT_REGION_CURRENCY
                        : key === "EXPO_PUBLIC_SCREENSHOT_MODE"
                          ? process.env.EXPO_PUBLIC_SCREENSHOT_MODE
                          : key === "EXPO_PUBLIC_SCREENSHOT_PROVIDER_SLUG"
                            ? process.env.EXPO_PUBLIC_SCREENSHOT_PROVIDER_SLUG
                            : key === "EXPO_PUBLIC_SCREENSHOT_PROVIDER_ID"
                              ? process.env.EXPO_PUBLIC_SCREENSHOT_PROVIDER_ID
                              : key === "EXPO_PUBLIC_SCREENSHOT_BOOKING_ID"
                                ? process.env.EXPO_PUBLIC_SCREENSHOT_BOOKING_ID
                                : key === "EXPO_PUBLIC_SCREENSHOT_HOLD_ID"
                                  ? process.env.EXPO_PUBLIC_SCREENSHOT_HOLD_ID
                                  : undefined;
  const fromExtra = (Constants.expoConfig?.extra as Record<string, string> | undefined)?.[key];
  const isPlaceholder = fromProcess === "YOUR_SUPABASE_URL" || fromProcess === "YOUR_SUPABASE_ANON_KEY";
  const val = fromExtra ?? (isPlaceholder ? undefined : fromProcess) ?? "";
  return val;
}

/** Use for native or when you need to enforce env; throws if missing. */
export function requireEnv(key: string): string {
  const val = getEnv(key);
  const failReason = !val ? "falsy" : val.trim() === "" ? "empty" : val === "YOUR_SUPABASE_URL" ? "placeholderUrl" : val === "YOUR_SUPABASE_ANON_KEY" ? "placeholderKey" : "ok";
  if (failReason !== "ok") {
    throw new Error(
      `Missing ${key}. Create .env.local from .env.example and add your Supabase URL and anon key. Never commit real keys.`
    );
  }
  return val;
}

/** Supabase URL – may be empty on web if .env not loaded (avoids throw at bundle load). */
export const SUPABASE_URL = getEnv("EXPO_PUBLIC_SUPABASE_URL") ?? "";
/** Supabase anon key – may be empty on web if .env not loaded. */
export const SUPABASE_ANON_KEY = getEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY") ?? "";

/** Backend (Next.js) URL. Optional for local web dev (Expo at :8081/:8082 uses http://localhost:3000). */
export const APP_URL = getEnv("EXPO_PUBLIC_APP_URL") ?? "";

/**
 * Resolved backend base URL for public fetches (config bundle, embedded WebViews, Sumsub embed).
 * Matches provider app: Expo web on localhost:8081/8082 or empty APP_URL → http://localhost:3000; native dev with empty APP_URL → localhost.
 */
export function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const o = window.location.origin;
    if (o === "http://localhost:8081" || o === "http://localhost:8082" || !APP_URL?.trim()) {
      return "http://localhost:3000";
    }
  }
  const url = APP_URL?.trim();
  if (!url && typeof __DEV__ !== "undefined" && __DEV__) return "http://localhost:3000";
  return url || "";
}

/** OneSignal App ID – optional; push notifications disabled if unset */
export const ONE_SIGNAL_APP_ID = getEnv("EXPO_PUBLIC_ONESIGNAL_APP_ID");

/** iOS App Store ID (e.g. 1234567890) – optional; used for force-update / "Update" store link. Set when app is published. */
export const IOS_APP_STORE_ID = getEnv("EXPO_PUBLIC_IOS_APP_STORE_ID") || "0000000000";

/**
 * Hostname that matches a row in `tenant_domains` (no port). When calling the Next.js web API from the app,
 * pass `webApiTenantHeaders()` so routes resolve `tenant_id` from Host (spec §12).
 */
export const WEB_API_TENANT_HOST = getEnv("EXPO_PUBLIC_WEB_API_TENANT_HOST") ?? "";
export const GLOBAL_ENTRY_HOST = getEnv("EXPO_PUBLIC_GLOBAL_ENTRY_HOST") ?? "";
export const DEFAULT_MARKET_HOST = getEnv("EXPO_PUBLIC_DEFAULT_MARKET_HOST") ?? "";
export const MARKET_HOST_OPTIONS = getEnv("EXPO_PUBLIC_MARKET_HOST_OPTIONS") ?? "";
export const MARKET_OVERRIDE_TTL_HOURS = Number(getEnv("EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS") || "24");

/** ISO 4217 fallback when config bundle has not loaded yet (must match build market). */
export const DEFAULT_REGION_CURRENCY = (() => {
  const raw = getEnv("EXPO_PUBLIC_DEFAULT_REGION_CURRENCY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : LAST_RESORT_CURRENCY;
})();

/** Store / automation only — set via EXPO_PUBLIC_SCREENSHOT_MODE in local capture builds; omit in production EAS profiles. */
export function isScreenshotMode(): boolean {
  const v = getEnv("EXPO_PUBLIC_SCREENSHOT_MODE").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Optional demo routing for deep links (partner profile, booking, checkout). */
export const SCREENSHOT_PROVIDER_SLUG = getEnv("EXPO_PUBLIC_SCREENSHOT_PROVIDER_SLUG");
export const SCREENSHOT_PROVIDER_ID = getEnv("EXPO_PUBLIC_SCREENSHOT_PROVIDER_ID");
export const SCREENSHOT_BOOKING_ID = getEnv("EXPO_PUBLIC_SCREENSHOT_BOOKING_ID");
export const SCREENSHOT_HOLD_ID = getEnv("EXPO_PUBLIC_SCREENSHOT_HOLD_ID");

export function webApiTenantHeaders(): Record<string, string> {
  const host = getActiveMarketHostSync().trim() || WEB_API_TENANT_HOST.trim();
  return host ? { "x-forwarded-host": host } : {};
}

/** Merge `x-forwarded-host` for Next.js tenant resolution on raw `fetch` calls (spec §7.1, §12). */
export function withWebApiTenantHeaders(init?: RequestInit): RequestInit {
  const tenant = webApiTenantHeaders();
  if (Object.keys(tenant).length === 0) return init ?? {};
  const h = new Headers(init?.headers as HeadersInit | undefined);
  for (const [k, v] of Object.entries(tenant)) {
    if (!h.has(k)) h.set(k, v);
  }
  return { ...init, headers: h };
}

/** Runtime market host controls tenant routing for global-ready single builds. */
export const initializeRuntimeMarketHost = initializeActiveMarketHost;
export const setRuntimeMarketHost = setRuntimeActiveMarketHost;
export const startRuntimeMarketHostLinkListener = startActiveMarketHostLinkListener;
export const getRuntimeMarketHost = getActiveMarketHostSync;
