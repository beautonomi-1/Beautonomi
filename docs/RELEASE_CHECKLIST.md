# Release Checklist

Use this checklist before deploying to staging or production. Each app can be built and verified without requiring Turbo (see per-app commands below).

## Pre-release

### Scale gates (required for high-scale rollout)

- [ ] All Tier-1 gates pass per `docs/SCALE_SLO_GATES.md`.
- [ ] Burst + soak load evidence attached to release notes.
- [ ] Canary window completed with no SLO burn-rate alerts.
- [ ] Provider portal baseline captured and archived (`pnpm run prod:provider:baseline` + `docs/PROVIDER_PORTAL_PERFORMANCE_BASELINE.md`).
- [ ] Provider route metrics coverage audit passed (`pnpm run prod:provider:route-metrics:audit`).
- [ ] Provider browser compatibility scan reviewed (`pnpm run prod:provider:compat:scan`, matrix in `docs/PROVIDER_PORTAL_BROWSER_MATRIX.md`).
- [ ] Provider canary gate check passed (`pnpm run prod:provider:canary:check -- --input <slo-summary.json>`, runbook in `docs/PROVIDER_PORTAL_CANARY_ROLLOUT.md`).

### Supabase

- [ ] All migrations applied to target project: `supabase db push` or apply migration files in order.
- [ ] Migration status matches `supabase/migrations/` (no pending local migrations unapplied in prod).
- [ ] RLS policies enabled on sensitive tables; service role used only server-side (see `scripts/prod/verify-rls-and-roles.md`).

### Environment variables

- [ ] **Web:** `.env` or host env (e.g. Vercel) has all required vars from `docs/ENVIRONMENT_MATRIX.md` (NEXT_PUBLIC_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL, PAYSTACK_SECRET_KEY, CRON_SECRET if using cron).
- [ ] **Customer / Provider:** EAS or build env has EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_APP_URL. No server secrets in app builds.
- [ ] No secret keys in PUBLIC vars; no NEXT_PUBLIC_* or EXPO_PUBLIC_* containing secrets.
- [ ] Observability gate env configured (`NEXT_PUBLIC_SENTRY_DSN` required; see `docs/SECRETS_BOOTSTRAP.md`).
- [ ] Domain-to-tenant mappings reviewed for this rollout (`docs/DOMAIN_TENANT_ROUTING_RUNBOOK.md`).
- [ ] Global routing go-live gates reviewed (`docs/GLOBAL_ROUTING_GO_LIVE_CHECKLIST.md`).

### Security

- [ ] Run `node scripts/prod/verify-public-endpoints.mjs` (against local or staging) and fix any reported secret-in-response.
- [ ] Run `node scripts/prod/readiness-check.mjs` and address any high-severity findings.
- [ ] Paystack webhook URL and secret configured in Paystack dashboard; Yoco webhooks if used.

## Build (per app, no Turbo required)

**Note (Windows):** Running `pnpm exec turbo run dev --filter=web` (or typecheck/lint) may fail with `spawnSync turbo.exe EPERM` on some Windows/PowerShell environments. Workaround: run tasks directly in each app (e.g. `cd apps\web; npx pnpm run typecheck`, then `lint`, then `test:run`). See also `docs/audit/DEVOPS_TOOLING.md` if you need to document environment-specific issues.

### Web

```bash
cd apps/web
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run build
```

- [ ] Build completes; no type or lint errors.
- [ ] Optional: `pnpm run test:run` (or `test`) for critical tests.

### Customer (Expo)

```bash
cd apps/customer
pnpm install
pnpm run typecheck
pnpm run lint
```

- [ ] Typecheck and lint pass.
- [ ] EAS build (when ready): `eas build --platform all --profile production` (ensure `eas.json` and app config are set).

### Provider (Expo)

```bash
cd apps/provider
pnpm install
pnpm run typecheck
pnpm run lint
```

- [ ] Typecheck and lint pass.
- [ ] EAS build: same as customer with provider app.

## Smoke tests (manual or automated)

- [ ] **Web:** Load `/`, `/search`, open a provider profile; if auth enabled, log in and open a booking flow (hold or full book).
- [ ] **Public config:** GET `/api/public/analytics-config`, `/api/public/third-party-config`, `/api/public/settings/branding` return 200 and only safe fields (no secret_key in body).
- [ ] **Payments:** Test payment flow end-to-end on staging; confirm webhook received and booking updated (or use test mode).
- [ ] **Mobile:** Open customer/provider app; load home; confirm config loads from EXPO_PUBLIC_APP_URL (e.g. config-bundle or analytics-config).

## Deploy

- [ ] Deploy web (e.g. Vercel): trigger deploy from main or release tag.
- [ ] Deploy Supabase: migrations already applied; no manual SQL in production without review.
- [ ] Mobile: Submit to stores or distribute via EAS/OTA as per your process.

## Rollback

- **Web:** Revert to previous Vercel deployment or redeploy last known-good commit.
- **Supabase:** Migrations are forward-only; rollback requires a new migration that reverses changes. Avoid destructive migrations in production without backup.
- **Mobile:** EAS rollback to previous build; OTA updates (expo-updates) can point to previous bundle if configured.

## Post-release

- [ ] Monitor logs for 5xx and webhook errors (see `docs/OBSERVABILITY_AND_ALERTS.md`).
- [ ] Confirm key flows: search, book, pay, webhook processing.
- [ ] Update `docs/PRODUCTION_READINESS.md` (or run scripts and note results) if you ran readiness-check/verify-public-endpoints and have new output to document.
