/// <reference types="vite/client" />

/** Injected at build time via `vite.config.ts` (merges `apps/web` + `apps/admin-web` `.env*` and `NEXT_PUBLIC_*` fallbacks). */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_URL: string;
  readonly VITE_SITE_URL: string;
  readonly VITE_WEB_ORIGIN: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_SENTRY_ENVIRONMENT: string;
  readonly VITE_GOOGLE_ANALYTICS_ID: string;
  readonly VITE_AMPLITUDE_API_KEY: string;
  readonly VITE_MAPBOX_ACCESS_TOKEN: string;
  readonly VITE_GLOBAL_ENTRY_HOST: string;
  readonly VITE_DEFAULT_MARKET_HOST: string;
  readonly VITE_MARKET_OVERRIDE_TTL_HOURS: string;
  readonly VITE_CATEGORY_ICON_CACHE_REVISION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
