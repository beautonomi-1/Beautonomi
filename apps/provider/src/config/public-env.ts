/**
 * Public environment variables for the provider Expo app.
 * EXPO_PUBLIC_* vars are injected at build time from .env / .env.local.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";
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
              : key === "EXPO_PUBLIC_ANDROID_PLAY_STORE_PACKAGE"
                ? process.env.EXPO_PUBLIC_ANDROID_PLAY_STORE_PACKAGE
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
                          : key === "EXPO_PUBLIC_SCREENSHOT_BOOKING_ID"
                            ? process.env.EXPO_PUBLIC_SCREENSHOT_BOOKING_ID
                            : undefined;
  const fromExtra = (
    Constants.expoConfig?.extra as Record<string, string> | undefined
  )?.[key];
  const isPlaceholder =
    fromProcess === "YOUR_SUPABASE_URL" ||
    fromProcess === "YOUR_SUPABASE_ANON_KEY";
  return fromExtra ?? (isPlaceholder ? undefined : fromProcess) ?? "";
}

/** Use when you need to enforce env; throws if missing. */
export function requireEnv(key: string): string {
  const val = getEnv(key);
  if (
    !val ||
    val.trim() === "" ||
    val === "YOUR_SUPABASE_URL" ||
    val === "YOUR_SUPABASE_ANON_KEY"
  ) {
    throw new Error(
      `Missing ${key}. Create .env.local from .env.example and add your Supabase URL and anon key. Never commit real keys.`,
    );
  }
  return val;
}

/** Supabase URL – may be empty if env not loaded (avoids throw at bundle load). */
export const SUPABASE_URL = getEnv("EXPO_PUBLIC_SUPABASE_URL") ?? "";
/** Supabase anon key – may be empty if env not loaded. */
export const SUPABASE_ANON_KEY = getEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY") ?? "";

/** Backend (Next.js) URL. Optional for API; required for forgot-password (reset link opens APP_URL/auth/callback). */
export const APP_URL = getEnv("EXPO_PUBLIC_APP_URL") ?? "";

const DEV_BACKEND_PORT = 3000;

/** Expo dev server host (e.g. 192.168.x.x:8081) — use same machine for apps/web on a physical device. */
function resolveDevBackendFromExpoHost(port = DEV_BACKEND_PORT): string | null {
  if (typeof __DEV__ === "undefined" || !__DEV__) return null;
  const raw =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2
      ?.extra?.expoClient?.hostUri;
  if (!raw || typeof raw !== "string") return null;
  const host = raw.split(":")[0]?.trim();
  if (!host) return null;
  if (host === "localhost" || host === "127.0.0.1") {
    if (Platform.OS === "android") return `http://10.0.2.2:${port}`;
    return `http://localhost:${port}`;
  }
  return `http://${host}:${port}`;
}

function devBackendFallback(): string {
  const fromExpo = resolveDevBackendFromExpoHost();
  if (fromExpo) return fromExpo;
  if (Platform.OS === "android") return `http://10.0.2.2:${DEV_BACKEND_PORT}`;
  return `http://localhost:${DEV_BACKEND_PORT}`;
}

/**
 * Resolved backend base for public fetches (config bundle, map WebView, Mapbox).
 * Expo web on localhost:8081/8082 or empty APP_URL → http://localhost:3000.
 * Native dev: derive LAN host from Expo when APP_URL is unset (physical device cannot use localhost).
 */
export function getBackendUrl(): string {
  const configured = APP_URL?.trim() ?? "";
  if (typeof window !== "undefined") {
    const o = window.location.origin;
    if (o === "http://localhost:8081" || o === "http://localhost:8082" || !configured) {
      return `http://localhost:${DEV_BACKEND_PORT}`;
    }
    return configured.replace(/\/$/, "");
  }
  if (configured) {
    if (
      typeof __DEV__ !== "undefined" &&
      __DEV__ &&
      (configured.includes("localhost") || configured.includes("127.0.0.1"))
    ) {
      const fromExpo = resolveDevBackendFromExpoHost();
      if (fromExpo) return fromExpo;
    }
    return configured.replace(/\/$/, "");
  }
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return devBackendFallback();
  }
  return configured.replace(/\/$/, "") || "";
}

/** OneSignal App ID – optional; push notifications disabled if unset */
export const ONE_SIGNAL_APP_ID = getEnv("EXPO_PUBLIC_ONESIGNAL_APP_ID");

/** iOS App Store ID (numeric) – optional; used for force-update store link. Set when app is published. */
export const IOS_APP_STORE_ID = getEnv("EXPO_PUBLIC_IOS_APP_STORE_ID") || "0000000000";

/** Android applicationId for Play Store deep links (default matches `app.config.js`). */
export const ANDROID_PLAY_STORE_PACKAGE =
  getEnv("EXPO_PUBLIC_ANDROID_PLAY_STORE_PACKAGE").trim() || "com.beautonomi.partner";

/** Hostname for `tenant_domains` when calling Next.js web APIs from the app (spec §12). */
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

export const SCREENSHOT_BOOKING_ID = getEnv("EXPO_PUBLIC_SCREENSHOT_BOOKING_ID");

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
