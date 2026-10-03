# Go-live readiness audit — 2026-10-03

Evidence-based audit across web/Vercel, Supabase, payments, mobile, and security. **Read-only** live checks were used where noted. This is **not** a certification of “fully secure” or “world class”; it is a **Go / Conditional Go / No-Go** summary with blockers.

**Audit environment:** Windows dev machine, Supabase CLI 2.67.1 (logged in), local `pnpm` gates.

---

## Executive verdict

| Area | Verdict | Summary |
|------|---------|---------|
| **Production web go-live** | **No-Go** | Live Paystack misconfiguration (DB + Vercel env), `/api/health` returns **503**, dependency advisories |
| **Staging Preview E2E** | **No-Go** | `staging.beautonomi.com` **unreachable** from audit network; Paystack not configured in staging DB |
| **Supabase (schema/storage)** | **Conditional Go** | `readiness:supabase:check` and `compare:supabase` pass; prod migration CLI ledger not verified (IPv6) |
| **Repo / CI gates** | **Conditional Go** | Most gates pass; **migration hygiene fails**; **46 uncommitted** paths; full `release:check` did not finish in audit window |
| **Mobile (store launch)** | **Conditional Go** | `release:check:mobile` passes; **expo-doctor** fails locally; EAS/device QA not verified |
| **Security** | **Conditional Go** | Sensible bucket ACLs for sensitive data; **12 high/critical** npm advisories; gitleaks not run locally |

**Overall recommendation:** **Do not treat production as go-live ready** until Paystack live keys and Vercel payment env are aligned, health returns 200 on production, staging host is live, and uncommitted migration/staging work is merged and deployed.

---

## Phase 1 — Repo and CI gates

| Check | Result | Evidence |
|-------|--------|----------|
| `pnpm audit:multi-tenant:strict` | **Pass** | No non-admin routes flagged; 22 admin files listed for review (expected) |
| `pnpm verify:cron-schedule` | **Pass** | All **71** cron paths in `apps/web/vercel.json` verified |
| `pnpm run release:check:mobile` | **Pass** | Typecheck + lint (0 errors) + parity **32/32** |
| `pnpm exec turbo run typecheck --filter=web` | **Pass** | 14 tasks OK |
| `node tooling/audit/check-migrations.mjs` | **Fail** | Canonical gap errors for missing version numbers **972–8060** (sparse numbering vs dense checker); see [scripts/migrations-allowed-gaps.json](../scripts/migrations-allowed-gaps.json) (only 11 gaps allowed today) |
| `pnpm run release:check` | **Incomplete** | Still running after **>20 minutes** at audit time (full monorepo test suite) |
| Uncommitted work | **Blocker** | **46** paths changed/untracked including migrations **970/971**, signup fix, staging docs/tooling, many migration renames/fixes |

**Must commit before go-live:** staging migrations, signup hero env fix, readiness tooling, and any Vercel-dependent app changes so **deployed code matches** staging Supabase.

---

## Phase 2 — Supabase

| Check | Result | Evidence |
|-------|--------|----------|
| `pnpm readiness:supabase:check` | **Pass** | Buckets, core tables, `verify:db` on prod + staging, preview domain rows |
| `pnpm compare:supabase` | **Pass** | `"gaps": []` |
| `supabase migration list` | **Not run** | CLI error: IPv6 DB host lookup failed after link; re-link with IPv4 per CLI hint |
| RLS harness (static) | **Pass** | `vitest run src/lib/security/__tests__/rls-harness.test.ts` — **15** tests |

**Production migration ledger:** Not refreshed in this audit (CLI connectivity). **Do not** run blind full `db push` on production until ledger is baselined (known from prior work).

---

## Phase 3 — Web / Vercel (live HTTP)

Hosts probed: `www.beautonomi.com`, `beautonomi.co.za`, `admin.beautonomi.com`, `staging.beautonomi.com`.

| URL | Status | Notes |
|-----|--------|-------|
| `www.beautonomi.com/api/health` | **503** | Body: `degraded` — Supabase **ok**; Paystack **fail**: `PAYSTACK_SECRET_KEY missing` ([paystackKeyProbe](apps/web/src/lib/health/deep-checks.ts)) |
| `www.beautonomi.com/api/public/home` (header `x-forwarded-host: beautonomi.co.za`) | **200** | Core API reachable |
| `www.beautonomi.com/api/cron/expire-booking-holds` (no secret) | **401** | Cron auth enforced |
| `POST www.beautonomi.com/api/payments/webhook` (no signature) | **400** | `Missing signature` (not 500) |
| `www.beautonomi.com/.well-known/apple-app-site-association` | **200** | |
| `www.beautonomi.com/.well-known/assetlinks.json` | **200** | |
| `admin.beautonomi.com/.well-known/*` | **200** | |
| `beautonomi.co.za/*` (same paths) | **307** | Redirect to apex/www (expected for some routes) |
| `staging.beautonomi.com/*` | **ERR** | Host unreachable (DNS/Vercel/domain not wired or not propagated) |

**Signup / CSP:** `GET https://www.beautonomi.com/signup` → **307** to `https://beautonomi.co.za/signup` with full **CSP**, **HSTS**, **X-Content-Type-Options** present.

**Observability script (local env):** `pnpm run prod:check:observability` → **NO-GO** — `NEXT_PUBLIC_SENTRY_DSN` missing **locally** (Vercel may still have it; user reported Sentry vars on **All Environments**).

**`pnpm run prod:verify:release`:** Did not complete within audit window (>8 min); re-run on CI or with production env loaded.

### Vercel environment checklist (names only — tick in dashboard)

**Production (required baseline)** — from [apps/web/.env.example](../apps/web/.env.example) and [docs/SECRETS_BOOTSTRAP.md](./SECRETS_BOOTSTRAP.md):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` (optional but recommended)
- **`PAYSTACK_SECRET_KEY`**, Paystack public key (env and/or DB — see Phase 4)
- **`CRON_SECRET`**, **`CSRF_SECRET`**
- `STRICT_TENANT_HOST_RESOLUTION`, `SUPPORTED_MARKET_COUNTRIES`, `TENANT_HOST_COUNTRY_MAP`
- `NEXT_PUBLIC_GLOBAL_ENTRY_HOST`, `NEXT_PUBLIC_DEFAULT_MARKET_HOST`, market auto-switch vars
- **`NEXT_PUBLIC_SENTRY_DSN`**, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (maps)
- `ADMIN_HOST`, `ENABLE_ADMIN_HOST_ROUTING`, `ADMIN_SPA_ROUTING` (user has these on Production / All)
- Optional: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, Paystack webhook override

**Preview (staging)** — from [apps/web/.env.staging.preview.example](../apps/web/.env.staging.preview.example):

- Staging Supabase URL/keys (`byfzhyqvtbasxptxdupf`)
- `NEXT_PUBLIC_APP_URL=https://staging.beautonomi.com`
- `TENANT_DOMAIN_ENV=preview`, `STRICT_TENANT_HOST_RESOLUTION=true`, `TENANT_DOMAIN_FALLBACK_TO_PRODUCTION=false`
- `CRON_SECRET`, `CSRF_SECRET`
- Paystack **test** keys (DB admin and/or Vercel Preview env)

---

## Phase 4 — Payments

Read-only DB audit (prefixes only):

| Environment | `region_secrets` (ZA) | `region_settings` public | `platform_secrets` global |
|-------------|------------------------|---------------------------|---------------------------|
| **Production** | **`sk_test`** | **`pk_test`** | Non-standard prefix on secret (masked); public masked |
| **Staging** | *none* | *none* | *none* |

**Implications:**

1. **Production No-Go for real money:** ZA **`region_secrets` wins** over admin/Vercel ([getPaystackSecretKey](apps/web/src/lib/payments/paystack-server.ts)). Production is configured to use **test** keys at the region layer even if live keys exist elsewhere.
2. **Vercel production** appears to lack **`PAYSTACK_SECRET_KEY`** (health probe + env fallback unused when region secret exists — but health still requires env key today).
3. **Staging Preview:** No Paystack rows in DB; payments on staging require **Admin → Paystack** and/or **`region_settings.paystack_public_key`** + Vercel Preview env until configured.

**Webhook URLs to confirm in Paystack dashboard:**

- Production: `https://www.beautonomi.com/api/payments/webhook` (and market hosts if used)
- Staging/test: `https://staging.beautonomi.com/api/payments/webhook` once staging is live

**E2E:** `money-path` / `booking-happy-path` Playwright against staging **not run** — staging host unreachable.

---

## Phase 5 — Mobile

| Check | Result |
|-------|--------|
| `release:check:mobile` | **Pass** (earlier in audit) |
| `expo config --type public` | **Pass** (customer + provider, prior session) |
| `npx expo-doctor` (customer) | **Fail** | Duplicate native module installations; New Architecture warning for Amplitude |
| `npx expo-doctor` (provider) | **Fail** | Same duplicate-module pattern |

**EAS / OTA:** Profiles in `apps/customer/eas.json` and `apps/provider/eas.json` use channels `development` / `preview` / `production`; production bakes `EXPO_PUBLIC_APP_URL=https://www.beautonomi.com` — **not** staging.

**EAS secrets to verify on expo.dev (per app):** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_APP_URL`, tenant host vars, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_ONESIGNAL_APP_ID`.

**Proposal (not implemented):** Add a **`staging` EAS profile** with staging Supabase + `https://staging.beautonomi.com` for device QA against Preview.

**Manual device QA (still required):** Push, Paystack WebView, universal links — see [MOBILE_LAUNCH_READINESS_2026-07-23.md](./MOBILE_LAUNCH_READINESS_2026-07-23.md).

---

## Phase 6 — Security

| Check | Result |
|-------|--------|
| `pnpm run audit:deps` | **Fail** | **12** advisories ≥ high (includes **CRITICAL** `next` RCE range — verify installed `next` version vs advisory) |
| Gitleaks | **Skipped locally** | CLI not installed; CI runs [gitleaks-action](.github/workflows/ci.yml) |
| `EXPO_PUBLIC_PAYSTACK*` in mobile apps | **Pass** | No matches in customer/provider |
| Hardcoded prod Supabase ref in `apps/web/src` | **Pass** | Signup hero uses `NEXT_PUBLIC_SUPABASE_URL` ([apps/web/src/app/signup/page.tsx](../apps/web/src/app/signup/page.tsx)) |

**Storage (production buckets, public flag):**

- **Private (good):** `receipts`, `verification-documents`, `message-attachments`, `booking-documents`, `merchant-onboarding-documents`, `grc-evidence`, `brand-assets`, `app-assets`, typo bucket `reciepts`
- **Public (review):** `learning-center`, `CMS-IMAGES`, `avatars`, `gallery`, etc. — expected for marketing
- **Flag:** `custom-request-attachments` is **public** on production — confirm this is intentional (PII risk if misused)

---

## Blockers (fix before production go-live)

1. **Paystack on production DB:** ~~Replace ZA test region keys~~ **Mitigated:** region test overrides cleared (`pnpm sync:paystack:production:clear-region`); optional full align via `pnpm sync:paystack:production` with [`.env.paystack.sync.local`](../apps/web/.env.paystack.sync.example). See [PAYSTACK_VERCEL_AND_REGION.md](./PAYSTACK_VERCEL_AND_REGION.md).
2. **Vercel Production:** Set **`PAYSTACK_SECRET_KEY=sk_live_…`** so `/api/health` Paystack probe passes and monitoring is green. **Redeploy** after env changes.
3. **Merge and deploy** uncommitted migration/signup/staging tooling so Vercel matches Supabase staging work.
4. **Staging host:** Wire **DNS + Vercel Preview** for `staging.beautonomi.com`; configure Preview env + Paystack test keys.
5. **Dependencies:** Remediate or accept **npm audit** findings (especially **Next.js** advisory).
6. **Migration hygiene CI:** Resolve `check-migrations.mjs` canonical gap failure or extend `migrations-allowed-gaps.json` with an documented policy.

---

## Manual checklist (you)

- [ ] Vercel Production: all names in §Phase 3 ticked; **`PAYSTACK_SECRET_KEY` live**
- [ ] Vercel Preview: staging Supabase + tenant preview vars
- [ ] Paystack dashboard: webhooks + test/live mode per environment
- [ ] Supabase Auth: Site URL / redirects for prod and staging
- [ ] EAS secrets + iOS credentials ([DEPLOYMENT_EAS.md](./DEPLOYMENT_EAS.md))
- [ ] Device QA matrix (mobile)
- [ ] Re-run `pnpm run release:check` and `pnpm run prod:verify:release` to completion on CI or locally with prod env

---

## Proposed fixes (awaiting approval)

1. Data fix: update production ZA Paystack region secrets/settings to **live** keys (superadmin + SQL/runbook).
2. Commit: migrations 970/971, signup page, staging docs, audit tooling, migration renames.
3. Infra: staging domain on Vercel Preview + DNS.
4. Optional code: extend `/api/health` Paystack probe to detect DB-configured keys (not only `PAYSTACK_SECRET_KEY` env) to reduce false 503.
5. Optional: `staging` EAS profile for mobile against Preview.
6. Refresh `docs/mobile-apps-readiness.md` (EAS IDs are real in `app.config.js`).
7. Remove or replace dead [`.github/workflows/release.yml`](../.github/workflows/release.yml) (`go-myapp`).

---

## Commands reference (re-run)

```powershell
pnpm readiness:supabase:check
pnpm compare:supabase
pnpm audit:multi-tenant:strict
pnpm verify:cron-schedule
pnpm run release:check:mobile
pnpm run audit:deps
pnpm --filter web exec vitest run src/lib/security/__tests__/rls-harness.test.ts
curl.exe -sS https://www.beautonomi.com/api/health
```

---

**Implementation tracker (updated):** [GO_LIVE_BLOCKERS_STATUS.md](./GO_LIVE_BLOCKERS_STATUS.md)

*Generated by go-live audit plan execution, 2026-10-03.*
