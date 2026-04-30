# Beautonomi — South Africa Launch Guide

> **Status:** Production-ready for ZA launch  
> **Last updated:** 2026-04-02  
> **Multi-tenant readiness (ZA):** 91 %  
> **Global expansion baseline:** 68 %

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Pre-Launch Checklist](#2-pre-launch-checklist)
3. [Environment Variables](#3-environment-variables)
4. [Database — Migrations & Seed Data](#4-database--migrations--seed-data)
5. [DNS & Domain Configuration](#5-dns--domain-configuration)
6. [Payment Configuration (Paystack + Yoco)](#6-payment-configuration-paystack--yoco)
7. [Notifications (OneSignal)](#7-notifications-onesignal)
8. [Analytics & Monitoring](#8-analytics--monitoring)
9. [Mobile Apps](#9-mobile-apps)
10. [Provider Onboarding](#10-provider-onboarding)
11. [Security Posture](#11-security-posture)
12. [Go-Live Runbook](#12-go-live-runbook)
13. [Post-Launch Operations](#13-post-launch-operations)
14. [Global Expansion Roadmap](#14-global-expansion-roadmap)

---

## 1. Architecture Overview

Beautonomi is a **multi-tenant, multi-market** beauty services marketplace. Each country/operator is a **tenant** with its own domain, currency, payment gateway config, branding, and feature flags.

```
                    ┌─────────────────────────────────────┐
                    │         beautonomi.co.za             │  ← ZA tenant
                    │         beautonomi.com               │  ← Global entry / ZA fallback
                    └──────────────┬──────────────────────┘
                                   │ Host header
                    ┌──────────────▼──────────────────────┐
                    │   Next.js API (apps/web)             │
                    │   resolveTenantIdWithZaFallback()    │  ← tenant_domains → tenants
                    └──────────────┬──────────────────────┘
                                   │ tenant_id
          ┌────────────────────────┼───────────────────────┐
          │                        │                       │
   ┌──────▼──────┐    ┌────────────▼────────┐   ┌─────────▼──────────┐
   │  Supabase   │    │  Config Bundle       │   │  Region Config     │
   │  (Postgres) │    │  feature_flags       │   │  currency: ZAR     │
   │  RLS-scoped │    │  branding overlay    │   │  gateway: Paystack │
   └─────────────┘    └─────────────────────┘   └────────────────────┘
```

### Tenant isolation model

| Layer | Mechanism |
|-------|-----------|
| HTTP routing | `Host` → `tenant_domains` (env-scoped) → `tenants.id` |
| API data | Every query includes `.eq("tenant_id", tenantId)` or goes through RLS |
| Database | Row Level Security on all production tables; service_role for server-side jobs |
| Config | `getPublicConfigBundle(tenantId)` — feature flags, branding, region meta |
| Payments | `region_payment_gateways` + `region_secrets` per region; `resourceTenantMatchesHostTenant` guard |
| Notifications | Tenant-aware template resolution (tenant-specific → global fallback) |

### ZA tenant facts

| Setting | Value |
|---------|-------|
| Tenant slug | `za` |
| Primary domain | `beautonomi.co.za` |
| Global entry | `beautonomi.com` |
| Default currency | `ZAR` |
| Default language | `en` |
| Timezone | `Africa/Johannesburg` |
| Primary payment gateway | Paystack |
| POS payment | Yoco |
| Region code | `ZA` |

---

## 2. Pre-Launch Checklist

Work through each item in order. Mark `[x]` when complete.

### Infrastructure
- [ ] Supabase project created in a region close to ZA (e.g. `ap-southeast-1` or dedicated ZA Supabase Cloud)
- [ ] All migrations in `supabase/migrations/` applied through the latest numbered file (no gaps): `supabase db push` or manual SQL execution
- [ ] ZA tenant row exists in `tenants` table: `slug = 'za'`, `is_active = true`
- [ ] `tenant_domains` rows exist for `beautonomi.co.za` + `beautonomi.com` with `environment = 'production'`
- [ ] Vercel (or equivalent) project deployed with production env vars set
- [ ] Custom domain `beautonomi.co.za` verified in Vercel
- [ ] SSL certificate issued (Vercel auto-provisions via Let's Encrypt)

### Database
- [ ] Migration 403 test Paystack keys **replaced** with production keys in `region_secrets` (see §6)
- [ ] `regions` table has `code = 'ZA'` row with `is_active = true`
- [ ] `region_payment_gateways` has Paystack row for ZA region with `is_primary_online = true`
- [ ] `region_secrets` has production `paystack_secret_key` and `paystack_public_key` for ZA region
- [ ] `subscription_plans` table has at least a `free` plan row with `currency = 'ZAR'`
- [ ] At least one global `notification_templates` row per key (`booking_confirmed`, etc.)

### Payments
- [ ] Paystack live mode enabled on dashboard
- [ ] Paystack webhook URL configured: `https://beautonomi.co.za/api/webhooks/paystack`
- [ ] Paystack webhook secret stored in `PAYSTACK_WEBHOOK_SECRET` env var
- [ ] Test a full booking payment end-to-end with a real card in staging
- [ ] Yoco account linked for at least one test provider (optional pre-launch)

### Mobile Apps
- [ ] Customer app (iOS + Android) pointing to production API URL
- [ ] Provider app (iOS + Android) pointing to production API URL
- [ ] OneSignal customer app configured with production credentials
- [ ] OneSignal provider app configured with production credentials
- [ ] App Store / Google Play store listings published or in review

### Security
- [ ] `STRICT_TENANT_HOST_RESOLUTION=true` in production env
- [ ] `CRON_SECRET` set to a random 32-byte hex string
- [ ] `RETENTION_LINK_SECRET` set to a random 32-byte hex string
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is server-side only, never exposed to client
- [ ] Sentry DSN configured and error alerting active

### Content
- [ ] At least 5 active providers onboarded and verified
- [ ] Global service categories seeded
- [ ] Platform settings configured in admin (payout %, Platform Fee, etc.)

---

## 3. Environment Variables

### Web app (`apps/web/.env.production.local`)

```env
# ── Supabase (REQUIRED) ─────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>          # Server-side only — NEVER expose

# ── Tenant routing ──────────────────────────────────────────────────
STRICT_TENANT_HOST_RESOLUTION=true                    # Fail closed for unknown hosts
DEV_DEFAULT_TENANT_SLUG=za                            # Unused in production

# ── Market config ───────────────────────────────────────────────────
SUPPORTED_MARKET_COUNTRIES=ZA
TENANT_HOST_COUNTRY_MAP={"beautonomi.co.za":"ZA","www.beautonomi.co.za":"ZA"}
NEXT_PUBLIC_GLOBAL_ENTRY_HOST=beautonomi.com
NEXT_PUBLIC_DEFAULT_MARKET_HOST=beautonomi.co.za
MARKET_AUTO_SWITCH_ENABLED=true
MARKET_AUTO_SWITCH_ALLOWED_COUNTRIES=ZA

# ── App URLs ────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://beautonomi.co.za

# ── Paystack (REQUIRED) ──────────────────────────────────────────────
PAYSTACK_SECRET_KEY=sk_live_<key>
PAYSTACK_PUBLIC_KEY=pk_live_<key>
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_<key>
PAYSTACK_WEBHOOK_SECRET=<webhook-secret>

# ── Cron / internal ─────────────────────────────────────────────────
CRON_SECRET=<random-32-byte-hex>
RETENTION_LINK_SECRET=<random-32-byte-hex>

# ── Monitoring ──────────────────────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
SENTRY_AUTH_TOKEN=<token>
SENTRY_ORG=beautonomi
SENTRY_PROJECT=web-nextjs

# ── Maps ─────────────────────────────────────────────────────────────
MAPBOX_ACCESS_TOKEN=<sk.token>
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=<pk.token>

# ── Analytics ───────────────────────────────────────────────────────
NEXT_PUBLIC_AMPLITUDE_API_KEY=<key>

# ── Push notifications ───────────────────────────────────────────────
ONESIGNAL_APP_ID=<customer-app-id>
ONESIGNAL_APP_ID_CUSTOMER=<customer-app-id>
ONESIGNAL_APP_ID_PROVIDER=<provider-app-id>
ONESIGNAL_REST_API_KEY=<customer-rest-key>
ONESIGNAL_REST_API_KEY_CUSTOMER=<customer-rest-key>
ONESIGNAL_REST_API_KEY_PROVIDER=<provider-rest-key>

# ── App download links ───────────────────────────────────────────────
NEXT_PUBLIC_CUSTOMER_IOS_LINK=https://apps.apple.com/za/app/beautonomi/<id>
NEXT_PUBLIC_CUSTOMER_ANDROID_LINK=https://play.google.com/store/apps/details?id=com.beautonomi.customer
NEXT_PUBLIC_PROVIDER_IOS_LINK=https://apps.apple.com/za/app/beautonomi-provider/<id>
NEXT_PUBLIC_PROVIDER_ANDROID_LINK=https://play.google.com/store/apps/details?id=com.beautonomi.provider
```

### Mobile apps (`apps/provider/.env` / `apps/customer/.env`)

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EXPO_PUBLIC_APP_URL=https://beautonomi.co.za       # Web API base
EXPO_PUBLIC_WEB_API_TENANT_HOST=beautonomi.co.za   # Tenant host for API calls
EXPO_PUBLIC_MARKET_HOST_OPTIONS=beautonomi.co.za
```

---

## 4. Database — Migrations & Seed Data

### Applying migrations

```bash
# Using Supabase CLI (recommended)
supabase db push --db-url "postgres://postgres:<password>@<host>:5432/postgres"

# Or apply individually via SQL editor in Supabase dashboard
# Migrations are numbered 001 → 410 in supabase/migrations/
```

### High-water mark migrations (most recent — apply if not already done)

| Migration | What it does | Required for ZA |
|-----------|-------------|-----------------|
| 407 | Subscription plan features JSON | ✅ |
| 408 | RLS on region tables + storage path policies | ✅ |
| 409 | RLS on provider_tip_settings + automation_executions | ✅ |
| 410 | RLS on postal_areas_import_stage | ✅ |

### Replace test Paystack keys (migration 403)

Migration 403 seeds **test mode** Paystack keys into `region_secrets`. Before going live, replace them:

```sql
-- Run in Supabase SQL editor (production)
UPDATE public.region_secrets
SET value_encrypted = 'sk_live_<YOUR_LIVE_SECRET_KEY>'
WHERE key = 'paystack_secret_key'
  AND region_id = (SELECT id FROM public.regions WHERE code = 'ZA');

UPDATE public.region_secrets
SET value_encrypted = 'pk_live_<YOUR_LIVE_PUBLIC_KEY>'
WHERE key = 'paystack_public_key'
  AND region_id = (SELECT id FROM public.regions WHERE code = 'ZA');
```

> ⚠️ Use Supabase Vault for secrets in production — `value_encrypted` should store Vault-managed encrypted secrets, not plaintext keys.

### Seed required subscription plans

```sql
INSERT INTO public.subscription_plans (slug, name, description, price, currency, billing_period, features, is_active)
VALUES
  ('free', 'Free', 'Get started with Beautonomi', 0, 'ZAR', 'monthly', '{"max_bookings_per_month": 20, "max_services": 5}', true),
  ('starter', 'Starter', 'Grow your business', 29900, 'ZAR', 'monthly', '{"max_bookings_per_month": 200, "max_services": 50}', true),
  ('pro', 'Pro', 'Unlimited growth', 79900, 'ZAR', 'monthly', '{"max_bookings_per_month": -1, "max_services": -1}', true)
ON CONFLICT (slug) DO NOTHING;
```

---

## 5. DNS & Domain Configuration

### Required DNS records

| Hostname | Type | Value | TTL |
|----------|------|-------|-----|
| `beautonomi.co.za` | A/CNAME | Vercel IP / `cname.vercel-dns.com` | 300 |
| `www.beautonomi.co.za` | CNAME | `cname.vercel-dns.com` | 300 |
| `beautonomi.com` | A/CNAME | Vercel IP / `cname.vercel-dns.com` | 300 |
| `www.beautonomi.com` | CNAME | `cname.vercel-dns.com` | 300 |

### Supabase `tenant_domains` rows (must exist in DB)

```sql
-- Verify these rows exist; insert if missing
SELECT hostname, environment, is_active FROM tenant_domains
WHERE hostname IN ('beautonomi.co.za', 'www.beautonomi.co.za', 'beautonomi.com', 'www.beautonomi.com');
```

Expected:

| hostname | environment | is_active |
|----------|-------------|-----------|
| beautonomi.co.za | production | true |
| www.beautonomi.co.za | production | true |
| beautonomi.com | production | true |
| www.beautonomi.com | production | true |

---

## 6. Payment Configuration (Paystack + Yoco)

### Paystack (online bookings)

Paystack is the primary online payment gateway for ZA. The integration covers:

- Customer booking checkout (card payments, debit orders)
- Deposits (configurable % or fixed amount per provider)
- Split payments (provider payout vs platform commission)
- Webhooks for async payment confirmation
- Refunds via admin portal

**Live mode checklist:**

1. Go to [Paystack Dashboard → Settings → API Keys](https://dashboard.paystack.com/#/settings/developer)
2. Copy **Live Secret Key** and **Live Public Key**
3. Update `region_secrets` table (see §4)
4. Set webhook URL: `https://beautonomi.co.za/api/webhooks/paystack`
5. Add Paystack webhook IP allowlist: `52.31.139.75`, `52.49.173.169`, `52.214.14.220`

### Yoco (in-person POS)

Yoco handles in-person card payments for providers at the salon/studio.

- Providers connect their Yoco account in Settings → Payments
- The provider app uses `YocoPaymentSheet` for POS transactions
- No webhook configuration needed — Yoco provides real-time SDK callbacks

### Payment settings per provider

Providers control their own payment preferences via **Settings → Payments**:

| Setting | Default | Notes |
|---------|---------|-------|
| Accept cash | ✅ | Always on |
| Accept card (Paystack) | ✅ | Requires Paystack enabled for tenant |
| Deposit required | ❌ | Configurable % or fixed amount |
| Deposit % | 30% | Only relevant if deposit enabled |
| Tips enabled | ✅ | Provider configures distribution |
| VAT rate | 15% | South African standard VAT |

---

## 7. Notifications (OneSignal)

### App configuration

Two OneSignal apps are required (one per mobile app):

| App | Env var | Purpose |
|-----|---------|---------|
| Customer app | `ONESIGNAL_APP_ID_CUSTOMER` + `ONESIGNAL_REST_API_KEY_CUSTOMER` | Push to customers |
| Provider app | `ONESIGNAL_APP_ID_PROVIDER` + `ONESIGNAL_REST_API_KEY_PROVIDER` | Push to providers |

### Notification templates

All templates live in the `notification_templates` table. Global templates (`tenant_id IS NULL`) apply to all tenants unless overridden. Template resolution order:

1. Tenant-specific row matching `(key, tenant_id)`
2. Global row matching `(key, tenant_id IS NULL)`

**Required templates for ZA launch** (seed if missing):

```sql
INSERT INTO notification_templates (key, title, body, enabled, channels)
VALUES
  ('booking_confirmed',     'Booking Confirmed',    'Your booking with {{provider_name}} is confirmed for {{date}} at {{time}}.', true, '{"push","email"}'),
  ('booking_reminder',      'Booking Reminder',     'Your appointment with {{provider_name}} is tomorrow at {{time}}.', true, '{"push"}'),
  ('booking_cancelled',     'Booking Cancelled',    'Your booking with {{provider_name}} on {{date}} has been cancelled.',        true, '{"push","email"}'),
  ('provider_new_booking',  'New Booking',          '{{customer_name}} booked {{service_name}} on {{date}} at {{time}}.',         true, '{"push"}'),
  ('payment_confirmed',     'Payment Received',     'Payment of {{amount}} confirmed for your booking.',                          true, '{"push","email"}')
ON CONFLICT (key) DO NOTHING;
```

---

## 8. Analytics & Monitoring

### Sentry (error tracking)

1. Create a Sentry project for `web-nextjs`
2. Set `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` in env
3. Configure alert rules for: error rate > 1%, p95 latency > 3s
4. Set up Slack/email notifications for critical errors

### Amplitude (product analytics)

Events are tracked via `apps/web/src/lib/analytics.ts` and mobile `AnalyticsProvider`. Key events tracked:

- `booking_started`, `booking_completed`, `booking_abandoned`
- `provider_signup`, `provider_onboarding_completed`
- `search_performed`, `service_viewed`

### Vercel Speed Insights

Already integrated via `<SpeedInsights />` in root layout. Monitor Core Web Vitals in Vercel dashboard.

### Uptime monitoring (recommended)

Set up external monitors for:

| Endpoint | Expected response | Alert if down |
|----------|------------------|---------------|
| `https://beautonomi.co.za` | 200 | < 1 min |
| `https://beautonomi.co.za/api/public/config-bundle` | 200 + `data.tenant_region.code = "ZA"` | < 1 min |
| `https://beautonomi.co.za/api/webhooks/paystack` | 405 (GET not allowed) | < 5 min |

---

## 9. Mobile Apps

### Production build configuration

```bash
# Provider app
cd apps/provider
eas build --profile production --platform all

# Customer app
cd apps/customer
eas build --profile production --platform all
```

### Required `eas.json` production vars

Ensure each app's `eas.json` production profile sets:

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_APP_URL": "https://beautonomi.co.za",
        "EXPO_PUBLIC_WEB_API_TENANT_HOST": "beautonomi.co.za",
        "EXPO_PUBLIC_SUPABASE_URL": "https://<project>.supabase.co"
      }
    }
  }
}
```

### OTA updates (Expo EAS Update)

```bash
eas update --branch production --message "ZA launch v1.0"
```

---

## 10. Provider Onboarding

### Self-serve onboarding flow

New providers register via `/signup` (web) or the provider app. The critical onboarding steps tracked by `/api/provider/setup-status`:

| Step | Required | Native screen |
|------|----------|---------------|
| Complete Business Profile | ✅ | Settings → Business |
| Complete Personal Profile | ✅ (freelancers) | Onboarding wizard |
| Add Service Address / Location | ✅ | Settings → Locations |
| Add Profile Photo | ✅ | Gallery |
| Add Services | ✅ | Catalogue |
| Set Availability | ✅ | Settings → Operating Hours |
| Add Portfolio Photos | ❌ | Gallery |
| Add Social Media Links | ❌ | Settings → Business |
| Set Up Payment Processing (Yoco) | ✅ | Settings → Yoco Devices |
| Set Up Payouts | ✅ | Settings → Payout Accounts |

### Admin approval flow

1. Provider submits for review
2. Admin verifies via Admin Portal → Providers
3. Admin toggles `providers.status` from `pending` → `active`
4. Provider receives push notification

### KYC / Identity verification

Powered by Sumsub. Providers complete ID verification via Settings → Verification (opens Sumsub SDK in-app). Admin monitors KYC status in the Sumsub dashboard.

---

## 11. Security Posture

### Headers applied (as of v1.0)

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Enforce HTTPS |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking protection |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing protection |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer leakage |
| `Permissions-Policy` | Camera, mic, USB blocked; geolocation/payment self-only | Feature access |
| `Content-Security-Policy` | Default-self; unsafe-inline for Next.js; Paystack, Mapbox, OneSignal allowlisted | XSS mitigation |

### RLS coverage

All 410 migrations have been reviewed. Every table used by the application has RLS enabled:

| Table group | RLS | Policy model |
|-------------|-----|--------------|
| Bookings, payments, providers | ✅ | Owner + service_role |
| Notification templates | ✅ | Global read; service_role write |
| Region tables (gateway configs, secrets) | ✅ | Service_role only |
| Storage (product-images) | ✅ | Path-scoped per provider |
| Automation executions | ✅ | Provider-scoped |
| Postal areas import stage | ✅ | Service_role only |

### Rate limiting coverage

| Endpoint | Mechanism | Limit |
|----------|-----------|-------|
| `POST /api/auth/sign-in` | IP-based, in-memory | 10 attempts / 15 min |
| `POST /api/public/bookings` | IP-based, in-memory | 20 bookings / 1 hour |
| `POST /api/public/booking-holds` | IP + fingerprint, in-memory | 5 IP/15 min, 3 fp/hr |
| Admin exports | User-based, in-memory | 30 req / hr per user |
| Portal availability | Per-session | See `rate-limit/portal.ts` |

### CORS policy

| Route | Policy |
|-------|--------|
| `/api/public/*` | `Access-Control-Allow-Origin: *` — required for express booking links embedded in external sites |
| `/api/*` (all others) | `Access-Control-Allow-Origin: ${NEXT_PUBLIC_APP_URL}` — origin-restricted; React Native apps are unaffected (no Origin header) |

### Known accepted risks

| Risk | Mitigation |
|------|-----------|
| Rate limiting is in-memory (not distributed) | Resets on serverless cold starts; post-launch task: migrate to Upstash Redis |
| No Stripe integration | ZA market uses Paystack — no Stripe required for launch |

---

## 12. Go-Live Runbook

Follow this sequence on launch day.

### T-7 days
- [ ] Staging environment at `staging.beautonomi.co.za` running with production database (copy)
- [ ] Full booking flow tested end-to-end: search → book → pay → confirm
- [ ] Provider onboarding tested end-to-end: signup → setup wizard → first booking
- [ ] Mobile apps submitted to App Store and Google Play review
- [ ] Paystack live mode keys loaded in `region_secrets` (not test keys)
- [ ] All env vars verified against §3 above

### T-1 day
- [ ] Database backup taken
- [ ] DNS TTLs reduced to 60s (for fast rollback if needed)
- [ ] On-call schedule confirmed
- [ ] Sentry alert rules active

### T=0 (Go live)
```bash
# 1. Merge final production build to main
git push origin main

# 2. Vercel deploys automatically; verify deployment
open https://vercel.com/beautonomi

# 3. Confirm tenant resolution works
curl -H "Host: beautonomi.co.za" https://beautonomi.co.za/api/public/config-bundle \
  | jq '.data.tenant_region.code'
# Expected: "ZA"

# 4. Smoke-test payment webhook
curl -X POST https://beautonomi.co.za/api/webhooks/paystack \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: <test-sig>" \
  -d '{"event":"charge.success","data":{"status":"success"}}'

# 5. Verify mobile apps can reach API
curl https://beautonomi.co.za/api/public/config-bundle \
  -H "X-App: customer"
```

### T+1 hour
- [ ] Check Sentry for unexpected errors
- [ ] Check Amplitude for first user events
- [ ] Verify at least one booking completes end-to-end
- [ ] Verify Paystack webhook logs in Paystack dashboard

---

## 13. Post-Launch Operations

### Daily
- Check Sentry error dashboard
- Review booking conversion rates in Amplitude
- Monitor Paystack transaction dashboard for failed payments

### Weekly
- Review provider onboarding funnel (signups → activated)
- Process provider payout queue (admin portal)
- Review notification delivery rates in OneSignal

### Monthly
- Apply any new Supabase migrations
- Review and rotate `CRON_SECRET` and `RETENTION_LINK_SECRET`
- Review RLS policies for any new tables added
- Update mobile apps via EAS Update for non-breaking changes

### Incident response

```
1. Error spike → Sentry alert → Check error details
2. Payment failure → Paystack dashboard → Check webhook logs at /api/admin/logs
3. Tenant resolution fail → Check tenant_domains table for correct host/env combos
4. Database slow → Supabase performance dashboard → Add indexes if needed
```

---

## 14. Global Expansion Roadmap

After ZA launch is stable, the following work enables the next market (e.g. Nigeria, UK, Kenya):

| Sprint | Work | Unlock |
|--------|------|--------|
| S1 | Seed new region in `regions` table + `region_settings` | DB only, no code |
| S1 | Add `tenant_domains` rows for new market domain | DB only |
| S1 | Create `region_payment_gateways` row (Flutterwave/Stripe) | DB + gateway adapter code |
| S2 | Build payment gateway adapter (factory pattern in booking checkout) | Medium — new `payments/*.ts` file |
| S2 | Add market language to `packages/i18n/src/locales/` | Translation content |
| S3 | Wire `lang`/`dir` to tenant locale in root layout | ✅ Already done |
| S3 | RTL CSS support (Tailwind `rtl:` variants) | Medium CSS work |
| S4 | Operator self-serve tenant provisioning UI | Significant feature |

**Current global readiness: 64 %**

The architecture — tenant resolution, config bundle, feature flags, region config, RLS isolation — is fully multi-tenant. What remains is operational: seeding new regions, integrating alternative payment gateways, and expanding the translation set.

---

*Document maintained by the Beautonomi engineering team. For questions, contact the platform team.*
