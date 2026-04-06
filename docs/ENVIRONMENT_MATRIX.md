# Environment Matrix

Environment variables used across the Beautonomi monorepo, by app and environment. Use this to configure development, staging, and production without leaking secrets.

## Summary

| Category | Web | Admin SPA (Vite) | Customer (Expo) | Provider (Expo) |
|----------|-----|------------------|-----------------|-----------------|
| Supabase | NEXT_PUBLIC_* + SERVICE_ROLE | `VITE_*` or merged `NEXT_PUBLIC_*` (see § Admin SPA) | EXPO_PUBLIC_SUPABASE_* | EXPO_PUBLIC_SUPABASE_* |
| App URL | NEXT_PUBLIC_APP_URL | Same (merged) | EXPO_PUBLIC_APP_URL | EXPO_PUBLIC_APP_URL |
| Payments | PAYSTACK_* (server only) | — (uses `/api` on web) | — (via API) | — (via API) |
| Integrations | Various (see below) | Same public keys as web when needed | EXPO_PUBLIC_ONESIGNAL_APP_ID (optional) | EXPO_PUBLIC_ONESIGNAL_APP_ID (optional) |

---

## Web (apps/web)

Source: `apps/web/.env.example`, `apps/web/next.config.mjs`, and API routes.

### PUBLIC (safe to expose to client bundles)

| Variable | Development | Staging | Production | Notes |
|----------|-------------|---------|------------|-------|
| NEXT_PUBLIC_SUPABASE_URL | ✓ | ✓ | ✓ | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ✓ | ✓ | ✓ | Anon key (RLS applies) |
| NEXT_PUBLIC_APP_URL | http://localhost:3000 | Staging URL | https://yourdomain.com | Base URL for API and redirects |
| NEXT_PUBLIC_SITE_URL | — | — | https://beautonomi.com | metadataBase, SEO |
| NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN | Optional | Optional | Optional | Mapbox public token (or from third-party-config) |
| NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY | Optional | Optional | Optional | Paystack public key (or from admin settings) |
| NEXT_PUBLIC_GOOGLE_MAPS_API_KEY | Optional | Optional | Optional | Google Maps (or from admin settings) |
| NEXT_PUBLIC_GOOGLE_PLACES_API_KEY | Optional | Optional | Optional | Google Places |
| NEXT_PUBLIC_GOOGLE_ANALYTICS_ID | Optional | Optional | Optional | GA4 |
| NEXT_PUBLIC_GOOGLE_VERIFICATION | Optional | Optional | Optional | Search console meta tag |
| NEXT_PUBLIC_SENTRY_DSN | Optional | Recommended | Required for scale-gated rollout | Required by `scripts/prod/verify-observability-gates.mjs` |

### SECRET (server-only; never in client bundle)

| Variable | Used by | Notes |
|----------|--------|-------|
| SUPABASE_SERVICE_ROLE_KEY | API routes, cron, webhooks | Bypasses RLS; use only server-side |
| PAYSTACK_SECRET_KEY | Payments, refunds, webhooks | Required for Paystack API |
| PAYSTACK_WEBHOOK_SECRET | Optional | Override webhook secret (else from platform_secrets) |
| CRON_SECRET | /api/cron/* | Authorize cron triggers |
| STRICT_TENANT_HOST_RESOLUTION | Tenant resolution | Set `true` for global-ready production to fail closed on unknown hosts (no implicit ZA fallback) |
| SUPPORTED_MARKET_COUNTRIES | Market availability | Comma-separated launched markets (ISO2), e.g. `ZA,UK,US` |
| RESTRICTED_COUNTRIES | Compliance | Optional ISO2 deny list for legal/restricted access handling |
| TENANT_HOST_COUNTRY_MAP | Market hints | Optional JSON host->ISO2 mapping for market domains. Do not map the global-entry host here. |
| MARKET_AUTO_SWITCH_ENABLED | Routing control | Kill-switch for global-entry auto-switch behavior (`true` by default) |
| MARKET_AUTO_SWITCH_ALLOWED_COUNTRIES | Routing rollout | Optional ISO2 allow-list for staged auto-switch rollout; empty means all launched markets |
| INTERNAL_API_SECRET | Fallback for cron | Optional |
| AMPLITUDE_SERVER_API_KEY | Server-side Amplitude | Optional |
| ONESIGNAL_APP_ID | Admin settings, server notifications | Optional |
| ONESIGNAL_SAFARI_WEB_ID | Admin settings | Optional |
| GOOGLE_CALENDAR_CLIENT_ID / _SECRET | Calendar OAuth | Optional |
| OUTLOOK_CLIENT_ID / _SECRET | Calendar OAuth | Optional |

### Build / runtime (no secrets)

| Variable | Purpose |
|----------|---------|
| NODE_ENV | development / production |
| NEXT_PUBLIC_GLOBAL_ENTRY_HOST | Host treated as global entry context for unsupported-country popup (default `beautonomi.com`) |
| NEXT_PUBLIC_DEFAULT_MARKET_HOST | Market host used for "Switch to available market" action (default `beautonomi.co.za`) |
| NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS | Hours to honor manual market override before auto-switch resumes (default 24) |
| VERCEL_ENV | production / preview (Vercel) |
| VERCEL_URL | Preview URL (Vercel) |
| ANALYZE | true to enable bundle analyzer |

---

## Customer app (apps/customer)

Source: `apps/customer/.env.example`, `apps/customer/app.config.js`, `apps/customer/src/config/public-env.ts`.

### PUBLIC (embedded in app; EXPO_PUBLIC_ prefix)

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| EXPO_PUBLIC_SUPABASE_URL | ✓ | ✓ | ✓ |
| EXPO_PUBLIC_SUPABASE_ANON_KEY | ✓ | ✓ | ✓ |
| EXPO_PUBLIC_APP_URL | http://localhost:3000 or LAN IP | Staging URL | https://yourdomain.com |
| EXPO_PUBLIC_WEB_API_TENANT_HOST | Optional (recommended) | Recommended | Recommended (e.g. beautonomi.co.za) |
| EXPO_PUBLIC_GLOBAL_ENTRY_HOST | Optional | Optional | Recommended | Global entry host for unsupported-country routing UX (e.g. beautonomi.com) |
| EXPO_PUBLIC_DEFAULT_MARKET_HOST | Optional | Optional | Recommended | Default transactional market host for market switch fallback |
| EXPO_PUBLIC_MARKET_HOST_OPTIONS | Optional | Optional | Optional | Comma list `host|Label` for native in-app market selector |
| EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS | Optional | Optional | Optional | Hours to honor manual override before auto-switch resumes (default 24) |
| EXPO_PUBLIC_ONESIGNAL_APP_ID | Optional | Optional | Optional |
| EXPO_PUBLIC_AMPLITUDE_API_KEY | Optional | Optional | Optional (usually from /api/public/analytics-config) |
| EXPO_PUBLIC_SENTRY_DSN | Optional | Recommended | Recommended | Sentry error reporting (see docs/SENTRY_WEB_SETUP.md) |

### SECRET

None. Payments and Mapbox tokens are obtained via backend (`EXPO_PUBLIC_APP_URL` + `/api/public/*`).

---

## Provider app (apps/provider)

Source: `apps/provider/.env.example`, `apps/provider/app.config.js`, `apps/provider/src/config/public-env.ts`.

### PUBLIC

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| EXPO_PUBLIC_SUPABASE_URL | ✓ | ✓ | ✓ |
| EXPO_PUBLIC_SUPABASE_ANON_KEY | ✓ | ✓ | ✓ |
| EXPO_PUBLIC_APP_URL | http://localhost:3000 or LAN IP | Staging URL | https://yourdomain.com |
| EXPO_PUBLIC_WEB_API_TENANT_HOST | Optional (recommended) | Recommended | Recommended (e.g. beautonomi.co.za) |
| EXPO_PUBLIC_GLOBAL_ENTRY_HOST | Optional | Optional | Recommended | Global entry host for unsupported-country routing UX (e.g. beautonomi.com) |
| EXPO_PUBLIC_DEFAULT_MARKET_HOST | Optional | Optional | Recommended | Default transactional market host for market switch fallback |
| EXPO_PUBLIC_MARKET_HOST_OPTIONS | Optional | Optional | Optional | Comma list `host|Label` for native in-app market selector |
| EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS | Optional | Optional | Optional | Hours to honor manual override before auto-switch resumes (default 24) |
| EXPO_PUBLIC_ONESIGNAL_APP_ID | Optional | Optional | Optional |

### Optional

| Variable | Notes |
|----------|-------|
| EXPO_PUBLIC_SENTRY_DSN | Sentry error reporting; recommended for staged/prod and used by observability policy |

---

## Config endpoints (consumed by clients)

Clients should not hardcode integration keys when the backend can serve them:

| Endpoint | Returns | Used by |
|----------|---------|---------|
| GET /api/public/analytics-config?environment= | Safe Amplitude config (api_key_public, flags) | Web, Customer, Provider (packages/analytics) |
| GET /api/public/third-party-config?service= | OneSignal app_id, Mapbox public_token, etc. | Customer/Provider (OneSignal, Mapbox) |
| GET /api/public/settings/branding | site_name, logo_url, colours | Web (PlatformSettingsProvider) |
| GET /api/public/config-bundle | amplitude, third_party, branding, flags, modules | Web (ConfigBundleProvider), Customer/Provider (config-bundle.ts) |
| GET /api/feature-flags/check?key= | { enabled } | Web (useFeatureFlag) |

All of the above must return only whitelisted fields (no secret_key, webhook_secret, etc.). See `docs/SECURITY_HARDENING.md` and `scripts/prod/verify-public-endpoints.mjs`.

---

## Production Env Vars – Quick Reference (Global Platform)

### Web (Vercel)

```env
STRICT_TENANT_HOST_RESOLUTION=true
NEXT_PUBLIC_GLOBAL_ENTRY_HOST=beautonomi.com
NEXT_PUBLIC_DEFAULT_MARKET_HOST=beautonomi.co.za
SUPPORTED_MARKET_COUNTRIES=ZA
RESTRICTED_COUNTRIES=
TENANT_HOST_COUNTRY_MAP={"beautonomi.co.za":"ZA","www.beautonomi.co.za":"ZA"}
MARKET_AUTO_SWITCH_ENABLED=true
MARKET_AUTO_SWITCH_ALLOWED_COUNTRIES=ZA
NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS=24
NEXT_PUBLIC_SENTRY_DSN=<your-web-sentry-dsn>
NEXT_PUBLIC_APP_URL=https://beautonomi.com
```

### Mobile (Provider + Customer, EAS)

```env
EXPO_PUBLIC_APP_URL=https://beautonomi.com
EXPO_PUBLIC_WEB_API_TENANT_HOST=beautonomi.co.za
EXPO_PUBLIC_GLOBAL_ENTRY_HOST=beautonomi.com
EXPO_PUBLIC_DEFAULT_MARKET_HOST=beautonomi.co.za
EXPO_PUBLIC_MARKET_HOST_OPTIONS=beautonomi.co.za|South Africa
EXPO_PUBLIC_MARKET_OVERRIDE_TTL_HOURS=24
```

> When expanding to more markets, update `SUPPORTED_MARKET_COUNTRIES`, `TENANT_HOST_COUNTRY_MAP`, `MARKET_AUTO_SWITCH_ALLOWED_COUNTRIES`, and `EXPO_PUBLIC_MARKET_HOST_OPTIONS` accordingly.

---

## Admin SPA (`apps/admin-web`)

Source: `apps/admin-web/.env.example`, `apps/admin-web/vite.config.ts`, `apps/admin-web/src/config/publicEnv.ts`.

The Vite build **loads `apps/web/.env*` first, then `apps/admin-web/.env*`** and injects merged values into `import.meta.env.VITE_*`. For each key below, **`VITE_*` in admin-web overrides** the Next-style value.

| Semantic (client bundle) | Prefer in admin `.env.local` | Falls back from web / `process.env` |
|---------------------------|------------------------------|-------------------------------------|
| Supabase URL / anon | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| App / site URL | `VITE_APP_URL`, `VITE_SITE_URL` | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` |
| Sentry DSN | `VITE_SENTRY_DSN` | `NEXT_PUBLIC_SENTRY_DSN` |
| GA / Amplitude / Mapbox | `VITE_GOOGLE_ANALYTICS_ID`, etc. | Matching `NEXT_PUBLIC_*` |
| Global entry / default market / override TTL | `VITE_GLOBAL_ENTRY_HOST`, … | `NEXT_PUBLIC_GLOBAL_ENTRY_HOST`, … |

**Vercel:** The same project env as `apps/web` is sufficient for `turbo` builds that compile `admin-web` after env is applied; explicit `VITE_*` is optional. **Local:** Either set `VITE_*` in `apps/admin-web/.env.local` or rely on `apps/web/.env.local` with `NEXT_PUBLIC_*` only.

`VITE_WEB_ORIGIN` is admin-only (e.g. `http://localhost:3000`) for deep links to legacy Next admin pages during split dev servers.

---

## Per-environment checklist

- **Development:** NEXT_PUBLIC_APP_URL / EXPO_PUBLIC_APP_URL = http://localhost:3000 (or LAN IP for devices). SERVICE_ROLE and PAYSTACK_SECRET_KEY in .env.local only.
- **Staging:** Same vars as production with staging URLs and keys. No production secrets.
- **Production:** All PUBLIC vars set; SECRET vars only in host (Vercel/host) env; CRON_SECRET set if using cron. See quick reference above for global platform vars.
