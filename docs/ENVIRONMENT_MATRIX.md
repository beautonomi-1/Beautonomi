# Environment Matrix

Environment variables used across the Beautonomi monorepo, by app and environment. Use this to configure development, staging, and production without leaking secrets.

## Summary

| Category | Web | Customer (Expo) | Provider (Expo) |
|----------|-----|-----------------|-----------------|
| Supabase | NEXT_PUBLIC_* + SERVICE_ROLE | EXPO_PUBLIC_SUPABASE_* | EXPO_PUBLIC_SUPABASE_* |
| App URL | NEXT_PUBLIC_APP_URL | EXPO_PUBLIC_APP_URL | EXPO_PUBLIC_APP_URL |
| Payments | PAYSTACK_* (server only) | — (via API) | — (via API) |
| Integrations | Various (see below) | EXPO_PUBLIC_ONESIGNAL_APP_ID (optional) | EXPO_PUBLIC_ONESIGNAL_APP_ID (optional) |

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

### SECRET (server-only; never in client bundle)

| Variable | Used by | Notes |
|----------|--------|-------|
| SUPABASE_SERVICE_ROLE_KEY | API routes, cron, webhooks | Bypasses RLS; use only server-side |
| PAYSTACK_SECRET_KEY | Payments, refunds, webhooks | Required for Paystack API |
| PAYSTACK_WEBHOOK_SECRET | Optional | Override webhook secret (else from platform_secrets) |
| CRON_SECRET | /api/cron/* | Authorize cron triggers |
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
| EXPO_PUBLIC_ONESIGNAL_APP_ID | Optional | Optional | Optional |
| EXPO_PUBLIC_AMPLITUDE_API_KEY | Optional | Optional | Optional (usually from /api/public/analytics-config) |
| EXPO_PUBLIC_SENTRY_DSN | Optional | Optional | Optional | Sentry error reporting (see docs/SENTRY_WEB_SETUP.md) |

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
| EXPO_PUBLIC_ONESIGNAL_APP_ID | Optional | Optional | Optional |

### Optional

| Variable | Notes |
|----------|-------|
| EXPO_PUBLIC_SENTRY_DSN | Sentry error reporting; set in `.env.local` and in app.config.js extra (see docs/SENTRY_WEB_SETUP.md) |

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

## Per-environment checklist

- **Development:** NEXT_PUBLIC_APP_URL / EXPO_PUBLIC_APP_URL = http://localhost:3000 (or LAN IP for devices). SERVICE_ROLE and PAYSTACK_SECRET_KEY in .env.local only.
- **Staging:** Same vars as production with staging URLs and keys. No production secrets.
- **Production:** All PUBLIC vars set; SECRET vars only in host (Vercel/host) env; CRON_SECRET set if using cron.
