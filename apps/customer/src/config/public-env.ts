/**
 * Public environment variables for the customer Expo app.
 * EXPO_PUBLIC_* vars are injected at build time from .env / .env.local.
 */
import Constants from "expo-constants";

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

/** OneSignal App ID – optional; push notifications disabled if unset */
export const ONE_SIGNAL_APP_ID = getEnv("EXPO_PUBLIC_ONESIGNAL_APP_ID");
