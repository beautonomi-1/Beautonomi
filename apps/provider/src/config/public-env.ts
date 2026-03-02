/**
 * Public environment variables for the provider Expo app.
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
  const fromExtra = (
    Constants.expoConfig?.extra as Record<string, string> | undefined
  )?.[key];
  const isPlaceholder =
    fromProcess === "YOUR_SUPABASE_URL" ||
    fromProcess === "YOUR_SUPABASE_ANON_KEY";
  return fromExtra ?? (isPlaceholder ? undefined : fromProcess) ?? "";
}

function requireEnv(key: string): string {
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

export const SUPABASE_URL = requireEnv("EXPO_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");

/** Backend (Next.js) URL. Optional for API; required for forgot-password (reset link opens APP_URL/auth/callback). */
export const APP_URL = getEnv("EXPO_PUBLIC_APP_URL") ?? "";

/** OneSignal App ID – optional; push notifications disabled if unset */
export const ONE_SIGNAL_APP_ID = getEnv("EXPO_PUBLIC_ONESIGNAL_APP_ID");
