/* global __dirname */
const fs = require("fs");
const path = require("path");

// Load .env.local and use parsed values directly (bypass process.env to avoid Expo placeholders)
const envPath = path.join(__dirname, ".env.local");
const envFromFile = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (key.startsWith("EXPO_PUBLIC_")) {
        envFromFile[key] = val;
        process.env[key] = val;
      }
    }
  }
}

// OneSignal mode: production for EAS production builds (APP_ENV=production), else development
const appEnv = process.env.APP_ENV || (process.env.NODE_ENV === "production" ? "production" : "development");
const oneSignalMode = appEnv === "production" ? "production" : "development";

function resolvePlugins(plugins) {
  if (!Array.isArray(plugins)) return plugins || [];
  return plugins.map((p) => {
    const name = Array.isArray(p) ? p[0] : p;
    if (name === "onesignal-expo-plugin") {
      return ["onesignal-expo-plugin", { mode: oneSignalMode }];
    }
    return p;
  });
}

// Base config from app.json (used when EAS/CI invokes config function without app.json merged)
const appJson = require("./app.json");

/** Merge env and plugins into base config. Function form so Expo passes app.json as base (satisfies expo-doctor). */
module.exports = ({ config }) => {
  const base = config?.expo ? config : { expo: appJson.expo };
  const iosStoreId =
    envFromFile.EXPO_PUBLIC_IOS_APP_STORE_ID ?? process.env.EXPO_PUBLIC_IOS_APP_STORE_ID ?? "";
  const extra = {
    ...(base.expo?.extra || {}),
    EXPO_PUBLIC_SUPABASE_URL: envFromFile.EXPO_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: envFromFile.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_APP_URL: envFromFile.EXPO_PUBLIC_APP_URL ?? process.env.EXPO_PUBLIC_APP_URL,
    EXPO_PUBLIC_ONESIGNAL_APP_ID:
      envFromFile.EXPO_PUBLIC_ONESIGNAL_APP_ID ?? process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID,
    EXPO_PUBLIC_SENTRY_DSN: envFromFile.EXPO_PUBLIC_SENTRY_DSN ?? process.env.EXPO_PUBLIC_SENTRY_DSN,
    EXPO_PUBLIC_IOS_APP_STORE_ID: iosStoreId,
    /** App Store numeric ID for in-app review / feedback links. */
    iosAppId: iosStoreId,
    APP_ENV: appEnv,
    EXPO_PUBLIC_DEFAULT_PHONE_REGION: envFromFile.EXPO_PUBLIC_DEFAULT_PHONE_REGION ?? process.env.EXPO_PUBLIC_DEFAULT_PHONE_REGION ?? "ZA",
    EXPO_PUBLIC_WEB_API_TENANT_HOST: envFromFile.EXPO_PUBLIC_WEB_API_TENANT_HOST ?? process.env.EXPO_PUBLIC_WEB_API_TENANT_HOST,
    EXPO_PUBLIC_GLOBAL_ENTRY_HOST: envFromFile.EXPO_PUBLIC_GLOBAL_ENTRY_HOST ?? process.env.EXPO_PUBLIC_GLOBAL_ENTRY_HOST,
    EXPO_PUBLIC_DEFAULT_MARKET_HOST: envFromFile.EXPO_PUBLIC_DEFAULT_MARKET_HOST ?? process.env.EXPO_PUBLIC_DEFAULT_MARKET_HOST,
    EXPO_PUBLIC_MARKET_HOST_OPTIONS: envFromFile.EXPO_PUBLIC_MARKET_HOST_OPTIONS ?? process.env.EXPO_PUBLIC_MARKET_HOST_OPTIONS,
    EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS: envFromFile.EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS ?? process.env.EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS,
  };
  return {
    ...base,
    expo: {
      ...base.expo,
      plugins: resolvePlugins(base.expo?.plugins),
      ios: {
        ...base.expo?.ios,
        entitlements: {
          ...(base.expo?.ios?.entitlements || {}),
          "aps-environment": appEnv === "production" ? "production" : "development",
        },
      },
      extra,
    },
  };
};
