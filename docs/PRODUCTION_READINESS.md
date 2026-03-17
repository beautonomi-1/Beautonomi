# Production Readiness Checklist

Use this checklist before deploying or building for production.

---

## 1. Pre-release checks (all apps)

From the repo root:

| Step | Command | Notes |
|------|---------|--------|
| Typecheck | `pnpm run typecheck` | All packages and apps |
| Lint | `pnpm run lint` | Fix any errors; warnings are acceptable if documented |
| Test | `pnpm run test` | Customer, provider, web test suites |
| Full build | `pnpm run prepare:production` | Optional; runs typecheck + lint + test + build |

Quick check (no build): `pnpm run release:check`

---

## 2. Mobile apps (customer & provider)

### Parity

- **Env / Supabase**: Both apps use `getEnv()` for public env; missing Supabase URL/key yields a stub client (app mounts, shows login) instead of crashing.
- **Init**: Both wrap `initSentry()` and `initSingular()` in `try/catch` so init failures don’t white-screen.
- **OneSignal**: Both set plugin `mode` from `APP_ENV` in `app.config.js`; EAS production profile sets `APP_ENV=production`.

### EAS production build

1. **Secrets** (expo.dev → project → Secrets) for **customer** and **provider**:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_APP_URL` (e.g. `https://beautonomi.com`)
   - Optional: `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_ONESIGNAL_APP_ID`

2. **Config**: No manual change for OneSignal; `--profile production` sets `APP_ENV=production` in `eas.json`.

3. **Pre-build**: From each app dir run `npx expo-doctor`.

4. **Build**: From app dir `eas build --profile production --platform ios` (and/or `android`), or from root: `pnpm run build:customer:ios`, `pnpm run build:provider:ios`, etc.

See [DEPLOYMENT_EAS.md](./DEPLOYMENT_EAS.md) for credentials, OTA, and full checklist.

---

## 3. Web app

- **Env**: Use `.env.local` (or deployment env). Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`. See `apps/web/.env.example`.
- **Secrets**: Never commit real keys; use platform secrets (e.g. Vercel env vars).
- **Build**: `pnpm run build` from root or `cd apps/web && pnpm build`.

---

## 4. Environment files

| App | File | Purpose |
|-----|------|--------|
| Customer | `apps/customer/.env.example` | Template; copy to `.env.local` |
| Provider | `apps/provider/.env.example` | Template; copy to `.env.local` |
| Web | `apps/web/.env.example` | Template; copy to `.env.local` |

Never commit `.env.local` or any file containing real secrets.

---

## 5. Optional verification

- **Expo Doctor**: In `apps/customer` and `apps/provider`, run `npx expo-doctor`. Both apps are set up to pass 17/17 (function-export in `app.config.js`, provider has `@react-native-community/slider` pinned to Expo SDK–expected 5.0.1). Use `--verbose` if you need details. If duplicate-deps or version checks fail after a dependency change, run `npx expo install --check` in that app or align versions per the tool’s advice.
- **EAS secrets**: Confirm in expo.dev that production secrets are set for the correct project (customer vs provider).
- **Web bundle**: If testing customer/provider web, run `node tooling/expo-dev/verify-web-bundle.js` while the dev server is running.

---

## Summary

- **Before every production deploy**: Run `pnpm run release:check` (or `prepare:production` if you want a full build).
- **Before first EAS production build**: Set EAS secrets, run `expo-doctor` in each app, then build with `--profile production`.
- **Both mobile apps**: Same env/stub and init patterns; production builds use `APP_ENV=production` for OneSignal and config.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Secret leakage from public endpoints | Whitelisting in analytics-config, third-party-config, branding, config-bundle; tests and `verify-public-endpoints.mjs`. |
| Provider data accessed across tenants | getProviderIdForUser() used in provider API routes; readiness-check heuristics flag routes missing it. |
| Admin routes accessible to non-superadmin | requireRoleInApi(['superadmin']) at start of each admin handler; auth-guards tests. |
| Paystack webhook replay or forgery | HMAC-SHA512 verification; idempotency via webhook_events table. |
| Inconsistent API response shape | Standard `{ data, error }` in api-helpers; some legacy routes may differ—document and normalize over time. |
| Env handling (missing or wrong env) | ENVIRONMENT_MATRIX.md and .env.example per app; fallbacks in code where safe (e.g. default branding). |
| Expo peer dependency warnings | Documented "known good" versions; build without Turbo per app. |

---

## Changes applied (reference)

- **Public endpoint safety:** Branding route returns whitelisted fields only; `public-config-safety.test.ts` covers analytics-config, third-party-config, branding.
- **Documentation:** ENVIRONMENT_MATRIX.md, SECURITY_HARDENING.md, OBSERVABILITY_AND_ALERTS.md, RELEASE_CHECKLIST.md.
- **Scripts:** `scripts/prod/readiness-check.mjs`, `scripts/prod/verify-public-endpoints.mjs`, `scripts/prod/verify-rls-and-roles.md`.

No changes to existing API contracts or backward compatibility.

---

## API response standard

- **Standard:** `{ data: T | null, error: { message, code?, details? } | null }` from `apps/web/src/lib/supabase/api-helpers.ts` (`successResponse`, `errorResponse`).
- **Exceptions:** Some legacy or external-facing routes may return different shapes (e.g. plain `{ enabled }` for feature-flags/check).
- **Recommendation:** Prefer successResponse/errorResponse for new routes; migrate legacy responses gradually.

---

## Dependency stability (Expo)

- **Known good versions (Expo 54):** react-native-reanimated ~4.1.6, @react-native-async-storage/async-storage ~2.2.0. expo ~54.0.33, react-native 0.81.5.
- **Peer warnings:** Some packages may warn about peer ranges; if builds pass, treat as warn-only.
- **Build without Turbo:** `pnpm --filter web build`, `pnpm --filter customer typecheck`, `pnpm --filter provider typecheck` (and lint); EAS build for mobile.

---

## GO / NO-GO criteria

**GO** when: All migrations applied; required env vars set (ENVIRONMENT_MATRIX); no secrets in PUBLIC vars; `readiness-check.mjs` passes; `verify-public-endpoints.mjs` passes for public config; smoke tests pass; Paystack webhook configured and tested.

**NO-GO** if: Any public endpoint returns a known secret field; provider route that mutates data does not use getProviderIdForUser; migrations pending or failing; build or typecheck fails; critical payment or webhook path broken in smoke test.
