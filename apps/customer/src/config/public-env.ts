/**
 * Public environment variables for the customer Expo app.
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

const DEV_BACKEND_PORT = 3000;

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
 * Resolved backend base URL for public fetches (config bundle, embedded WebViews, Sumsub embed).
 * Matches provider app: Expo web on localhost:8081/8082 or empty APP_URL → http://localhost:3000.
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

/** iOS App Store ID — production listing `id6748387058` (EAS `EXPO_PUBLIC_IOS_APP_STORE_ID`). */
export const IOS_APP_STORE_ID = getEnv("EXPO_PUBLIC_IOS_APP_STORE_ID") || "6748387058";

/** Android applicationId for Play Store deep links (default matches `app.config.js`). */
export const ANDROID_PLAY_STORE_PACKAGE =
  getEnv("EXPO_PUBLIC_ANDROID_PLAY_STORE_PACKAGE").trim() || "com.beautonomi";

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

/** Merge tenant + mobile app identity headers for raw `fetch` (WAF bypass + spec §7.1). */
export function withWebApiTenantHeaders(init?: RequestInit): RequestInit {
  const h = new Headers(init?.headers as HeadersInit | undefined);
  if (!h.has("X-App")) h.set("X-App", "customer");
  const tenant = webApiTenantHeaders();
  for (const [k, v] of Object.entries(tenant)) {
    if (!h.has(k)) h.set(k, v);
  }
  return { ...init, headers: h };
}

/**
 * User-Agent token appended to in-app `WebView` requests so the Vercel Firewall can
 * bypass bot / rate-limit rules for first-party app traffic.
 *
 * WHY: `withWebApiTenantHeaders` only tags raw `fetch` calls with `X-App`; WebView
 * page loads (and every subresource / XHR they fan out into) cannot send that header.
 * The UA, however, is sent on *every* request the WebView makes, so it is the reliable
 * signal for the Firewall bypass.
 *
 * KEEP IN SYNC: the Vercel Firewall allow rule must match `User-Agent contains
 * "BeautonomiApp"`. The `/customer` suffix lets you distinguish app surfaces if needed.
 */
export const MOBILE_WEB_USER_AGENT_TOKEN = "BeautonomiApp/customer";

/**
 * Props to spread onto a `react-native-webview` `<WebView>` that loads first-party
 * Beautonomi pages. `applicationNameForUserAgent` appends the token to the platform's
 * default UA (keeping a realistic browser UA) and applies to all requests the page makes.
 */
export function inAppWebViewUserAgentProps(): { applicationNameForUserAgent: string } {
  return { applicationNameForUserAgent: MOBILE_WEB_USER_AGENT_TOKEN };
}

/** Runtime market host controls tenant routing for global-ready single builds. */
export const initializeRuntimeMarketHost = initializeActiveMarketHost;
export const setRuntimeMarketHost = setRuntimeActiveMarketHost;
export const startRuntimeMarketHostLinkListener = startActiveMarketHostLinkListener;
export const getRuntimeMarketHost = getActiveMarketHostSync;
