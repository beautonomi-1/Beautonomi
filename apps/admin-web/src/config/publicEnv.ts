/**
 * Browser-safe public env for the admin SPA.
 * Build-time values come from `VITE_*` in `apps/admin-web/.env*` and — when unset —
 * the same keys as Next.js `NEXT_PUBLIC_*` loaded from `apps/web/.env*` and `process.env`
 * (see `vite.config.ts` `define`). Vercel/web CI can keep using only `NEXT_PUBLIC_*`.
 */
export const publicEnv = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  appUrl: import.meta.env.VITE_APP_URL,
  siteUrl: import.meta.env.VITE_SITE_URL,
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  sentryEnvironment: import.meta.env.VITE_SENTRY_ENVIRONMENT,
  googleAnalyticsId: import.meta.env.VITE_GOOGLE_ANALYTICS_ID,
  amplitudeApiKey: import.meta.env.VITE_AMPLITUDE_API_KEY,
  mapboxAccessToken: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,
  globalEntryHost: import.meta.env.VITE_GLOBAL_ENTRY_HOST,
  defaultMarketHost: import.meta.env.VITE_DEFAULT_MARKET_HOST,
  marketOverrideTtlHours: import.meta.env.VITE_MARKET_OVERRIDE_TTL_HOURS,
  categoryIconCacheRevision: import.meta.env.VITE_CATEGORY_ICON_CACHE_REVISION,
} as const;

/**
 * Customer/provider-facing web app origin — never the admin SPA host (`admin.*`).
 * Used when staff copy links meant for end users (Learning Center, help, etc.).
 */
export function publicSiteOrigin(): string {
  const fromEnv = (publicEnv.siteUrl || publicEnv.appUrl || "").replace(/\/$/, "").trim();
  if (fromEnv) return fromEnv;

  const host = (publicEnv.globalEntryHost || publicEnv.defaultMarketHost || "").replace(/\/$/, "").trim();
  if (host) {
    return host.includes("://") ? host.replace(/\/$/, "") : `https://${host}`;
  }

  if (typeof window !== "undefined") {
    const origin = window.location.origin.replace(/\/$/, "");
    // Avoid admin subdomain when env is unset (e.g. misconfigured prod deploy).
    if (!/^https?:\/\/admin\./i.test(origin)) {
      return origin;
    }
  }

  return "";
}
