# Web App – Production Readiness Audit

**Date:** 2025-03-14  
**Scope:** Full audit of `apps/web` (Next.js 16) for production readiness.

---

## Summary

| Area | Status | Notes |
|------|--------|------|
| TypeScript | ✅ Pass | `npx tsc --noEmit` exits 0 (after chip-combobox fix) |
| ESLint | ✅ Pass | `npm run lint` (eslint .) exits 0 |
| Auth & API | ✅ Good | getCurrentUserServer/getUser, requireAuth/requireRole, Bearer + cookie |
| Config & Env | ✅ Good | .env.example, next.config env, no secrets in client |
| Error handling | ✅ Good | RootErrorBoundary, Sentry server/edge, debug ingest opt-in only |
| Security | ✅ Good | Service role/CRON/Paystack server-side only; security headers |
| Production config | ⚠️ See notes | Images remotePatterns, Sentry upload, cron secret |

---

## 1. Structure & dependencies

- **Framework:** Next.js 16.1.4, React 19.2, App Router.
- **Key deps:** @supabase/ssr, @supabase/supabase-js, @sentry/nextjs, @beautonomi/* workspace packages, Radix UI, Tailwind, Recharts, Mapbox, Sharp.
- **Scripts:** `typecheck`, `lint`, `lint:fix`, `test`, `build`, `start`, `dev` (port 3000, NODE_OPTIONS for memory).

---

## 2. Configuration & environment

- **`.env.example`**  
  Documents required (Supabase URL/anon/service role, APP_URL, Paystack, CRON_SECRET) and optional (Mapbox, Sentry, OneSignal, analytics, mobile store links). No secrets committed.

- **`next.config.mjs`**  
  Exposes `NEXT_PUBLIC_SENTRY_DSN` via `env`; `compiler.removeConsole` in production (keeps error/warn); Sentry config uses `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`. Transpiles workspace packages; images with remotePatterns for Supabase storage.

- **Images `remotePatterns`**  
  Derived from `NEXT_PUBLIC_SUPABASE_URL`: if set and HTTPS, its hostname is added first; `*.supabase.co` is always included. No hardcoded project hostname.

---

## 3. Auth & API

- **Server Supabase:** `getSupabaseServer()` uses cookies (createServerClient) or Authorization Bearer (createSupabaseClientFromToken) for mobile/Expo. Validates Supabase URL/key and throws if placeholder/localhost.

- **Auth helpers (`src/lib/supabase/auth-server.ts`):**  
  `getSessionServer()` validates with `getUser()` then gets session; `getCurrentUserServer()` uses `getUser()`; `requireAuth()` / `requireRole()` throw if unauthenticated or insufficient role. Role hierarchy: superadmin > support_agent > provider_owner > provider_staff > customer.

- **API routes:** Protected routes use `requireAuth()` or `requireRole()`. Service role key used only in server-side report/subscription/payment routes; CRON_SECRET for cron/internal webhooks.

- **Portal auth:** `portal-auth.ts` validates portal tokens (query/cookie), redirects to /portal/error if invalid, sets x-portal-booking-id and optional cookie. No global Next.js middleware file; portal routes use this helper where needed.

---

## 4. Error handling & observability

- **RootErrorBoundary:** Wraps app in root layout; componentDidCatch calls `logError()` only when `NEXT_PUBLIC_DEBUG_INGEST_URL` is set (optional local debug). Production does not send to any debug ingest.

- **GlobalErrorLogger / other debug:** Same pattern – debug ingest URL from env; undefined in production.

- **Sentry:** `sentry.server.config.ts` and edge config use `SENTRY_DSN`; init when dsn set; tracesSampleRate by NODE_ENV. withSentryConfig in next.config for source maps (authToken, org, project). Client DSN via NEXT_PUBLIC_SENTRY_DSN.

- **Production compiler:** `removeConsole` in production (exclude error, warn) to reduce log noise.

---

## 5. Security

- **Secrets:** SUPABASE_SERVICE_ROLE_KEY, PAYSTACK_*, CRON_SECRET, Sentry auth token, OneSignal keys used only in server code (API routes, server components). Not exposed to client.

- **Headers (next.config):** X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy origin-when-cross-origin, X-DNS-Prefetch-Control. API routes have CORS (Allow-Origin *, Allow-Methods/Headers) for mobile apps.

- **CORS:** API allows * origin for mobile (provider/customer apps). If you need to restrict, add allowed origins and use a list instead of *.

---

## 6. Fixes applied in this audit

- **`src/components/ui/chip-combobox.tsx`**  
  TypeScript errors: `value` in union type could be inferred as `string | string[]`, producing `(string | string[])[]` for selectedList/displayValues and breaking `key`/`getLabelForValue`/`removeValue`. Fixed by normalizing to `string[]`: single mode use `[String(value)]`, multi mode use `Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []`.   Same for displayValues.

- **`next.config.mjs` images.remotePatterns`**  
  Replaced hardcoded `ifybcfafrwcpptckznpm.supabase.co` with hostname derived from `NEXT_PUBLIC_SUPABASE_URL` at build time. If the URL is set and HTTPS, that host is added first; `*.supabase.co` remains for any Supabase storage. Different deployments can use different Supabase projects without code change.

---

## 7. Recommendations

1. **Images:** Set `NEXT_PUBLIC_SUPABASE_URL` at build time so image remotePatterns include your Supabase storage host; `*.supabase.co` is always allowed.
2. **CORS:** If production API should restrict origins, replace `*` with explicit origins for customer/provider app URLs.
3. **Cron / internal webhooks:** Ensure CRON_SECRET (and any INTERNAL_API_SECRET) are set in production and not guessable; use HTTPS and validate secret in handlers.
4. **Sentry:** Set SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT for production builds and source map uploads.

---

## 8. Checklist before release

- [ ] `.env.local` (or deployment env) set: NEXT_PUBLIC_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL, PAYSTACK_*, CRON_SECRET; optional Mapbox, Sentry, OneSignal, analytics.
- [ ] Run `pnpm typecheck` and `pnpm lint` in apps/web.
- [ ] Build: `pnpm build`; test `pnpm start`.
- [ ] Verify auth flows (login, callback, portal, API Bearer + cookie).
- [ ] Verify cron/internal webhook routes are protected by CRON_SECRET.
- [ ] Confirm Sentry receives events and source maps in production (if configured).

---

## Related documentation

- **[MAINTENANCE.md](./MAINTENANCE.md)** — Maintenance & Coming Soon: per-scope gating, admin UI, notify sign-ups, APIs.

---

**Conclusion:** The web app is in good shape for production. TypeScript and lint pass after fixing chip-combobox value typing and making image remotePatterns env-driven. Auth, API, and config are server-safe and env-driven; error handling and Sentry are in place; debug ingest is opt-in only. Confirm CORS and cron secret for your production checklist.
