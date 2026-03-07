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

/** Merge env and plugins into base config. Function form so Expo passes app.json as base (satisfies expo-doctor). */
module.exports = ({ config }) => {
  return {
    ...config,
    expo: {
      ...config.expo,
      plugins: resolvePlugins(config.expo?.plugins),
      extra: {
        ...(config?.expo?.extra || {}),
        EXPO_PUBLIC_SUPABASE_URL: envFromFile.EXPO_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: envFromFile.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        EXPO_PUBLIC_APP_URL: envFromFile.EXPO_PUBLIC_APP_URL ?? process.env.EXPO_PUBLIC_APP_URL,
        EXPO_PUBLIC_SENTRY_DSN: envFromFile.EXPO_PUBLIC_SENTRY_DSN ?? process.env.EXPO_PUBLIC_SENTRY_DSN,
        APP_ENV: appEnv,
      },
    },
  };
};
