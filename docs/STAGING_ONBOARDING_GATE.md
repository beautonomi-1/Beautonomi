# Staging provider onboarding gate

Use this checklist after deploying Preview (`staging.beautonomi.com`) when validating provider onboarding parity (pricing catalog, travel fees, maps, OTP, checkout).

Related: [STAGING_VERCEL_PREVIEW_ENV.md](./STAGING_VERCEL_PREVIEW_ENV.md), [STAGING_MATRIX_PREP.md](./go-live/STAGING_MATRIX_PREP.md), [ONBOARDING_SUBSCRIPTION_E2E.md](../apps/provider/docs/ONBOARDING_SUBSCRIPTION_E2E.md).

## Pre-deploy QA (2026-10-12)

| Check | Local repo | Live staging (before this deploy) |
|-------|------------|-----------------------------------|
| `pnpm exec tsc --noEmit` (apps/web) | Pass | — |
| Vitest (pricing catalog, travel validation, platform-limits, plans route) | 9/9 pass | — |
| `GET /api/public/pricing/plans` | Filter drops unlinked legacy rows (after deploy) | **Fail:** 4 plans incl. legacy `Starter` (unlinked) |
| `verify-staging-preview.mjs` pricing probe | — | **Fail** until deploy + migration `993` |
| Mapbox `mapboxPublicToken` | — | **Missing** on directions-config (ops) |

After merging and deploying Preview, re-run `node tooling/audit/verify-staging-preview.mjs` and the manual sign-off script below.

## Automated (local / CI)

```bash
node tooling/audit/verify-staging-preview.mjs
# Optional strict live probe:
VERCEL_AUTOMATION_BYPASS_SECRET=... node tooling/audit/verify-staging-preview.mjs --require-live
```

The script checks staging DB tenant map and, when reachable, live endpoints including:

- `GET /api/public/pricing/plans` — no active legacy CMS names (`Starter`, `Professional`, `Enterprise` as unlinked duplicates); each `subscription_plan_id` appears at most once.
- `GET /api/public/directions-config` — `mapboxPublicToken` present when maps are required for your tenant.

## Manual matrix

| Area | Verify | Fix |
|------|--------|-----|
| **Auth OTP** | `POST /api/auth/otp/send` → 200 for email and phone | Staging Supabase: custom SMTP + phone/Twilio |
| **Maps** | `GET /api/public/directions-config` → `mapboxPublicToken` | Tenant `mapbox_config`: `is_enabled=true`, `pk` token; Preview `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` |
| **Pricing** | Plan step shows linked Beautonomi tiers only (no legacy “Starter” card) | Run migration `993_deactivate_legacy_pricing_plans.sql`; API catalog filter |
| **Travel limits** | `GET /api/provider/travel-fees/platform-limits` (logged-in customer) → numeric defaults | Tenant `platform_settings.settings.travel_fees`; tenant-scoped route |
| **Travel Fees UI** | Freelancer path with zones skipped: defaults card + custom fields + preview | Web onboarding Travel Fees step |
| **Plan checkout** | Free → active subscription; Growth → Paystack test checkout | Preview Paystack keys; `paystack_plan_code_*` on paid pricing rows |
| **Config sync** | Prod→staging pricing rows sync | `sync-staging-config-from-production.mjs` keys `pricing_plans` by `name` |

## Sign-off script

1. Complete **web** onboarding as mobile/both freelancer with **zones skipped** → Travel Fees shows platform defaults and optional custom rates.
2. Plan step: **no duplicate free tiers**; select **Beautonomi Starter** (free) → submit → subscription active.
3. Repeat with **Growth** (paid) → submit → Paystack test payment completes.
4. Run [ONBOARDING_SUBSCRIPTION_E2E.md](../apps/provider/docs/ONBOARDING_SUBSCRIPTION_E2E.md) on staging.

## UI / accessibility acceptance

On `/provider/onboarding` at **plan**, **travel fees**, and **zones** steps:

- Lighthouse or axe accessibility score ≥ 95; no contrast violations on primary CTAs (uses `primary-hover` fill).
- Keyboard: complete wizard; plan grid responds to arrow keys; focus rings visible.
- Viewports **375px** and **1280px**: no “Free Free” duplicate label; sticky nav does not cover content (`pb-28` on mobile shell).

Attach before/after screenshots of plan and travel fees steps to the release PR.
