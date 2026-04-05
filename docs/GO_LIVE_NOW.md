# Go live — ordered runbook

Use this page as the **short path** to production. Deep detail lives in the linked docs.

## 1. Code and CI

1. Merge your release branch to **`main`** (or whatever Vercel production tracks).
2. Confirm **GitHub Actions** on that branch are green (install, typecheck, lint, build-web, tests, audit).

Local sanity (optional but recommended):

```bash
pnpm install --frozen-lockfile
pnpm run release:check
```

For a full local build before deploy: `pnpm run prepare:production`.

## 2. Database (Supabase)

1. **Apply every file** under `supabase/migrations/` to the **production** project (no skipped numbers).  
   - CLI: `supabase link` then `supabase db push`, or run migrations via your approved process.
2. Confirm **RLS** and tenant rows match your launch market (ZA: see [ZA_LAUNCH.md](./ZA_LAUNCH.md) §2–4).

## 3. Web (Vercel)

1. **Node.js 24** on the project (matches CI and `.nvmrc`).
2. **Install**: `pnpm install` (monorepo root; lockfile frozen in CI — keep Vercel in sync with `packageManager` in root `package.json`).
3. **Environment variables** (Production + Preview as needed):
   - Required baseline: `apps/web/.env.example` (Supabase public + `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, Paystack if you take payments, **CSRF_SECRET**).
   - **CRON_SECRET** (or **INTERNAL_API_SECRET**): required for Vercel **crons** in `apps/web/vercel.json` and secured cron routes.
   - Global / ZA platform copy-paste tables: [SECRETS_BOOTSTRAP.md](./SECRETS_BOOTSTRAP.md), [ENVIRONMENT_MATRIX.md](./ENVIRONMENT_MATRIX.md).
4. **Domains**: production host(s) assigned; `tenant_domains` rows match real Host headers ([DOMAIN_TENANT_ROUTING_RUNBOOK.md](./DOMAIN_TENANT_ROUTING_RUNBOOK.md)).
5. Deploy production; run **smoke tests** from [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) § Smoke tests.

## 4. Mobile (EAS)

1. **EAS secrets** for customer + provider projects: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_APP_URL`, and production URLs per [SECRETS_BOOTSTRAP.md](./SECRETS_BOOTSTRAP.md).
2. `npx expo-doctor` in each app; then **production** EAS builds and store submission per [DEPLOYMENT_EAS.md](./DEPLOYMENT_EAS.md).

## 5. Post-deploy

1. Paystack (and other) **webhook URLs** point at production APIs; secrets match dashboard.
2. Monitor errors (e.g. Sentry); see [OBSERVABILITY_AND_ALERTS.md](./OBSERVABILITY_AND_ALERTS.md) if configured.
3. Optional: `pnpm run prod:verify:release` against staging/production policy (see `scripts/prod/release-verify.mjs`).

---

**Full checklists:** [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) · [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) · [ZA_LAUNCH.md](./ZA_LAUNCH.md)
