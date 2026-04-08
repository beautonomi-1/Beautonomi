# Global Expansion, Localisation & Internationalisation — Comprehensive Guide

> **Purpose:** A complete reference for expanding Beautonomi to multiple countries/regions, with per-region domains, region-scoped superadmins, and all integrations considered. Covers web, Expo mobile apps, payment gateways, and effort estimates.
>
> **Codebase reference:** This guide is grounded in the actual schema (285 migrations), API routes, and config patterns in the Beautonomi monorepo.

---

## Table of contents

0. [Current Platform Architecture](#0-current-platform-architecture-codebase-snapshot)  
1. [Executive Summary](#1-executive-summary)  
2. [Use Cases](#2-use-cases-covered)  
3. [Data Model Changes](#3-data-model-changes)  
4. [Integrations](#4-integrations--per-region-considerations)  
5. [Expo (Mobile Apps)](#5-expo-mobile-apps--comprehensive)  
6. [Web — Domain & Routing](#6-web--domain--routing)  
7. [Payment Gateways](#7-payment-gateways--country-mapping)  
8. [Effort Estimates](#8-effort-estimates)  
9. [Effort Summary](#9-effort-summary)  
10. [Migration Path](#10-migration-path)  
11. [Risks & Mitigations](#11-risks--mitigations)  
12. [Additional Considerations](#12-additional-considerations)  
13. [References](#13-references)

---

## 0. Current Platform Architecture (Codebase Snapshot)

### 0.1 Config sources (used by `getPublicConfigBundle`)

| Source | Table | Purpose |
|--------|-------|---------|
| Amplitude | `amplitude_integration_config` | API key, guides, surveys; env-scoped |
| Platform settings | `platform_settings` | `settings` JSONB: branding, onesignal, mapbox, localization, payouts, apps, sales |
| Feature flags | `feature_flags` | `feature_key` UNIQUE; rollout, platforms_allowed, roles_allowed |
| On-demand | `on_demand_module_config` | Ringtone, timeouts; env-scoped |
| AI | `ai_module_config` | Gemini; env-scoped |
| Ads | `ads_module_config` | Sponsored slots; env-scoped |
| Ranking | `ranking_module_config` | Quality score; env-scoped |
| Distance | `distance_module_config` | Radius filter; env-scoped |
| Sumsub | `sumsub_integration_config` | KYC; env-scoped |
| Aura | `aura_integration_config` | Optional; env-scoped |
| Safety | `safety_module_config` | Panic, check-in; env-scoped |

### 0.2 Secrets (server-only)

| Source | Table | Keys |
|--------|-------|------|
| Platform | `platform_secrets` | paystack_*, onesignal_rest_api_key, mapbox_access_token, amplitude_secret_key |
| Integrations | `gemini_integration_config`, `sumsub_integration_config`, `aura_integration_config` | API keys; env-scoped |

### 0.3 Key schema constraints

| Table | Constraint | Multi-region impact |
|-------|------------|---------------------|
| `providers` | `slug TEXT NOT NULL UNIQUE` | Slug is global; consider `UNIQUE(region_id, slug)` |
| `platform_secrets` | Singleton (one row) | Must add `region_secrets` or `region_id` |
| `loyalty_rules` | `currency TEXT` | One rule per currency; add `region_id` |
| `promotions` | `applicable_providers UUID[]` | Add `region_id` for region-scoped promos |
| `subscription_plans` | Paystack plan codes | Region-specific plans or `region_id` |
| `memberships` | Customer products; `currency` | Add `region_id` for customer memberships |
| `notification_templates` | `key TEXT NOT NULL UNIQUE` | Add `region_id` (nullable) for overrides |
| `feature_flags` | `feature_key UNIQUE` | Add `region_id` (nullable) for overrides |
| `page_content`, `faqs`, `resources` | CMS | Add `region_id` (nullable) |
| `featured_cities` | `country_code`, `city_code` | Filter by region; or add `region_id` |

### 0.4 Cron jobs (vercel.json)

| Path | Schedule | Region impact |
|------|----------|---------------|
| `/api/cron/send-reminders` | 0 9 * * * | Add region filter or iterate regions |
| `/api/cron/expire-booking-holds` | 0 1 * * * | Same |
| `/api/cron/expire-on-demand-requests` | 0 2 * * * | Same |
| `/api/cron/execute-automations` | 0 6 * * * | Same |
| `/api/cron/process-recurring-bookings` | 0 0 * * * | Same |
| `/api/cron/check-low-stock` | 0 8 * * * | Same |

### 0.5 Public APIs that accept `country` today

| Route | Param | Default |
|-------|-------|---------|
| `GET /api/public/home` | `country` | `"ZA"` |
| `GET /api/public/banks` | `country` | — |
| `GET /api/provider/payout-accounts/banks` | `country` | `"ZA"` |

### 0.6 ISO reference data (already multi-region ready)

- `iso_countries` — code, phone_country_code
- `iso_currencies` — code, symbol, decimal_places
- `iso_languages` — code, native_name
- `iso_locales` — language + country
- `iso_timezones` — IANA codes, country_code

### 0.7 API routes requiring region awareness

| Route | Current | Change |
|-------|---------|--------|
| `GET /api/public/home` | `country` param, default ZA | Add region from header; filter providers by `region_id` |
| `GET /api/public/config-bundle` | No region | Add `region` query / header |
| `GET /api/public/platform-settings` | Single row | Fetch `region_settings` when region present |
| `GET /api/public/providers/[slug]` | Slug lookup | Scope by region if slug per region |
| `GET /api/public/booking-holds`, consume | — | Use region for payment gateway |
| `POST /api/public/bookings` (via consume) | — | Same |
| `GET /api/public/banks` | `country` param | Derive from region |
| `GET /api/provider/payout-accounts/banks` | `country` param | Derive from provider's region |
| All `/api/payments/*` | Paystack | Select gateway by region |
| All `/api/admin/*` | Global | Filter by region for region_superadmin |

---

## 1. Executive Summary

| Aspect | Recommendation |
|--------|----------------|
| **Domain strategy** | Per-region domains (e.g. `beautonomi.co.za`, `beautonomi.co.uk`, `beautonomi.com.au`) |
| **Admin model** | Region-scoped superadmins + global superadmin |
| **Mobile apps** | **Single** customer app + **single** provider app; region-aware via config |
| **Database** | Single DB with `region_id` (Phase 1); consider DB-per-region later |
| **Payment gateways** | Region-specific: Paystack (Africa), Stripe (global), Yoco (ZA/Africa), others per market |
| **Total effort** | **~12–18 weeks** for full multi-region (Phases 1–5) |

### Integration summary

| Integration | Region-specific? | Effort |
|-------------|-----------------|--------|
| Paystack | Yes (keys per region) | 1–2 days |
| Yoco | Yes (ZA primary) | 0.5 day |
| Stripe | Yes (new; keys per region) | 5–7 days |
| Amplitude | Optional (region in events) | 1 day |
| OneSignal | Optional | 0.5 day |
| Mapbox | Optional (token per region) | 0.5 day |
| Google/Outlook Calendar | Redirect URIs per domain | 1 day |
| Twilio | Optional (account per region) | 1 day |
| Sumsub | Yes (config per region) | 1 day |
| Singular | Links use region domain | 0.5 day |
| Sentry | Region in context | 0.5 day |

---

## 2. Use Cases Covered

### 2.1 Customer-facing

| Use case | Current | Multi-region | Notes |
|----------|---------|--------------|-------|
| Discovery & search | Single global | Filter by region | Home, search, explore scoped by region |
| Provider profiles | All providers | Region-scoped | Provider slug unique per region |
| Booking flow | Single | Region-aware | Currency, payment methods, legal from region |
| Payment | Paystack | Region gateway | Paystack (ZA/NG/GH/KE), Stripe (UK/US/EU), etc. |
| Wallet | ZAR | Region currency | Wallet balance per region |
| Loyalty | Points | Region rules | Loyalty rules per region |
| Gift cards | Single | Region-scoped | Gift card marketplace per region |
| Language | 4 (en, zu, af, st) | Extensible | Add pt-BR, es, fr, etc. per region |
| Deep links | beautonomi.com | All region domains | App links per domain |

### 2.2 Provider-facing

| Use case | Current | Multi-region | Notes |
|----------|---------|--------------|-------|
| Onboarding | Single | Region-aware | Currency, banks, payout gateway per region |
| Payouts | Paystack | Region gateway | Paystack (Africa), Stripe Connect (global) |
| In-person POS | Yoco | Region gateway | Yoco (ZA), Square (US/UK), etc. |
| Subscriptions | Paystack | Region gateway | Provider subscription per region |
| Calendar sync | Google/Outlook | Same | OAuth config can be per-region |
| Messaging | Twilio | Region config | Twilio account per region |
| Verification | Sumsub | Region config | Sumsub per region |

### 2.3 Admin

| Use case | Current | Multi-region | Notes |
|----------|---------|--------------|-------|
| Global superadmin | Full access | Unchanged | Sees all regions |
| Region superadmin | N/A | New | Sees only assigned region |

---

## 3. Data Model Changes

### 3.1 New tables

```sql
-- Regions (countries or market clusters)
CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,              -- e.g. 'za', 'uk', 'au'
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,           -- e.g. 'beautonomi.co.za'
  default_currency TEXT NOT NULL DEFAULT 'ZAR',
  default_language TEXT NOT NULL DEFAULT 'en',
  supported_languages TEXT[] DEFAULT ARRAY['en'],
  timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',          -- region-specific overrides
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Region-scoped platform settings (extends platform_settings)
CREATE TABLE region_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  UNIQUE(region_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Region-scoped payment gateway config
CREATE TABLE region_payment_gateways (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL,                 -- 'paystack', 'stripe', 'yoco', etc.
  config JSONB NOT NULL DEFAULT '{}',    -- public keys, webhook URLs (no secrets)
  is_primary_online BOOLEAN DEFAULT false,
  is_primary_pos BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(region_id, gateway),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Region-scoped secrets (platform_secrets equivalent)
CREATE TABLE region_secrets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_encrypted TEXT,
  UNIQUE(region_id, key),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin region assignments (region-scoped superadmins)
CREATE TABLE admin_region_assignments (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'region_superadmin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, region_id)
);
```

### 3.2 Schema changes

| Table | Change |
|-------|--------|
| `providers` | Add `region_id UUID REFERENCES regions(id)`; consider `UNIQUE(region_id, slug)` |
| `users` | Add `region_id UUID` (optional; for region-scoped admins) |
| `platform_settings` | Keep for fallback; prefer `region_settings` when `region_id` present |
| `platform_secrets` | Add `region_id UUID` (nullable) for region-scoped secrets |

### 3.3 Provider slug uniqueness

**Current:** `providers.slug` is `UNIQUE` globally. One provider = one slug worldwide.

**Options for multi-region:**

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A. Keep global | Providers stay global; region filters discovery only | No migration; slug stays unique | Same business can't have "jane-salon" in ZA and UK separately |
| B. Slug per region | `UNIQUE(region_id, slug)` | Same slug in different regions | Migration: drop old UNIQUE, add new; backfill `region_id` |

**Recommendation:** Option B if you expect providers to operate in multiple regions as separate entities. Option A if providers are global and region is just a filter.

### 3.4 Tables requiring `region_id` (full list)

| Category | Tables |
|----------|--------|
| **Core** | `providers`, `region_settings`, `region_payment_gateways`, `region_secrets` |
| **Admin** | `admin_region_assignments` |
| **Content** | `page_content`, `faqs`, `resources`, `featured_cities` (nullable) |
| **Templates** | `notification_templates`, `email_templates`, `sms_templates` (nullable) |
| **Commerce** | `loyalty_rules`, `promotions`, `memberships`, `subscription_plans`, `pricing_plans` |
| **Feature flags** | `feature_flags` (nullable for overrides) |

**Note on `user_wallets`:** Currently one wallet per user (`user_id UNIQUE`), currency ZAR. For multi-region, either: (a) keep single wallet, use region's default currency when creating; or (b) allow multiple wallets per user per region/currency — requires schema change to `UNIQUE(user_id, region_id)` or `UNIQUE(user_id, currency)`.

---

## 4. Integrations — Per-Region Considerations

### 4.1 Payment gateways

| Gateway | Current | Countries | Multi-region approach |
|---------|---------|-----------|------------------------|
| **Paystack** | Primary (online) | ZA, NG, GH, KE (beta: CI, EG) | One Paystack account per region. Keys in `region_secrets`. Paystack API uses country param. |
| **Yoco** | In-person POS | ZA (primary), Africa expansion | Same as Paystack. `provider_yoco_integrations` per provider; region determines gateway availability. |
| **Stripe** | Not used | Global | Add for UK, US, EU, AU. Stripe Connect for payouts. `region_payment_gateways` + `region_secrets`. |
| **Square** | Not used | US, UK, AU, etc. | Alternative to Yoco for POS in non-African markets. |

**Payment gateway mapping by region (example):**

| Region | Online | In-person (POS) |
|--------|--------|------------------|
| ZA | Paystack | Yoco |
| NG | Paystack | — |
| UK | Stripe | Square |
| US | Stripe | Square |
| AU | Stripe | Square |

**Code changes:**

| File | Change |
|------|--------|
| `apps/web/src/lib/payments/paystack-complete.ts` | Add region param; use `region_secrets` for keys |
| `apps/web/src/lib/platform/secrets.ts` | Add `getRegionSecrets(regionId)` |
| `apps/web/src/app/api/payments/webhook/` | Route by gateway + region; Paystack webhook path can be `/api/webhooks/paystack/[region]` |
| `apps/web/src/app/api/provider/payout-accounts/banks/route.ts` | `ISO_TO_PAYSTACK_COUNTRY` already has ZA, NG, GH, KE; add Stripe bank list when region uses Stripe |
| `apps/web/src/app/api/public/banks/route.ts` | Same as above |
| New | `getPaymentGatewayForRegion(regionId)` → `{ online, pos }` |

### 4.2 Analytics (Amplitude)

| Aspect | Current | Multi-region |
|--------|---------|---------------|
| API key | `platform_settings` + `platform_secrets` | `region_settings` + `region_secrets` |
| Config | `GET /api/public/config-bundle` | Add `?region=za` or `X-Region: za` |
| Events | Global | Add `region` to `identify` and event payloads |
| Projects | Single | Option: one Amplitude project per region for isolation |

**Effort:** 1–2 days to add region to config-bundle and identify payloads.

### 4.3 Push (OneSignal)

| Aspect | Current | Multi-region |
|--------|---------|---------------|
| App ID | `platform_settings` + `third-party-config` | `region_settings` |
| Config | One per app | One per region per app (optional) or single app with region in user props |
| Deep links | beautonomi.com | All region domains in `associatedDomains` / `intentFilters` |

**Recommendation:** Single OneSignal app; use user properties for region. Add all region domains to deep link config.

### 4.4 Maps (Mapbox)

| Aspect | Current | Multi-region |
|--------|---------|---------------|
| Token | `platform_settings` / `platform_secrets` | `region_settings` / `region_secrets` |
| Usage | Geocoding, directions, zones | Same; region can override token for usage limits |

**Recommendation:** Single Mapbox token initially; per-region tokens if billing/quotas require it.

### 4.5 Calendar (Google, Outlook)

| Aspect | Current | Multi-region |
|--------|---------|---------------|
| OAuth | `GOOGLE_CALENDAR_CLIENT_ID`, `OUTLOOK_CLIENT_ID` | Same or per-region env (e.g. `GOOGLE_CALENDAR_CLIENT_ID_UK`) |
| Redirect URI | `NEXT_PUBLIC_APP_URL` | Must include all region domains in Google/Outlook OAuth console |

**Code change:** `redirect_uri` in `apps/web/src/app/api/provider/calendar/auth/[provider]/route.ts` uses `request.nextUrl.origin` — ensure each region domain is registered in OAuth apps.

### 4.6 Messaging (Twilio)

| Aspect | Current | Multi-region |
|--------|---------|---------------|
| Config | `provider_messaging_integrations` per provider | Twilio account can be per region |
| SMS | Provider-level | Region can enforce Twilio account (e.g. UK number for UK providers) |

**Recommendation:** Provider-level config stays; add `region_id` to Twilio account selection if multiple regions have different Twilio accounts.

### 4.7 Verification (Sumsub)

| Aspect | Current | Multi-region |
|--------|---------|---------------|
| Config | `platform_settings` + control plane | `region_settings` |

**Recommendation:** Sumsub supports multiple regions; per-region config for applicant country rules.

### 4.8 Attribution (Singular)

| Aspect | Current | Multi-region |
|--------|---------|---------------|
| SDK Key | EAS Secrets | Same per app; region passed as param |
| Link URLs | `platform_settings.settings.apps` | Store URLs can include region (e.g. `beautonomi.co.za/book/...`) |

**Recommendation:** Singular links can use region domain; no change to SDK key.

### 4.9 Error tracking (Sentry)

| Aspect | Current | Multi-region |
|--------|---------|---------------|
| DSN | Env | Same per app |
| Context | — | Add `region` to Sentry scope |

**Recommendation:** Add `region` to Sentry scope for filtering; single DSN.

---

## 5. Expo (Mobile Apps) — Comprehensive

### 5.1 Single app vs per-region apps

| Approach | Pros | Cons |
|----------|------|------|
| **Single app** (recommended) | One codebase, one store listing, OTA updates, region-aware | Region must be passed to API |
| **Per-region apps** | Separate store listings per country | 2x+ builds, maintenance, no cross-region |

**Recommendation:** Single customer app + single provider app. Region derived from device locale, user choice, or API.

### 5.2 Config bundle

| Current | Multi-region |
|---------|--------------|
| `GET /api/public/config-bundle?platform=customer&environment=production` | Add `?region=za` or `X-Region: za` header |

**Config bundle sources (from `apps/web/src/lib/config/index.ts`):**

- `platform_settings` → `region_settings` when `region` present; fallback to `platform_settings`
- `amplitude_integration_config` → add `region_id` (nullable) for per-region Amplitude
- `feature_flags` → filter by `region_id` or use `region_flags` override table
- Module configs (`on_demand`, `ai`, `ads`, etc.) → env-scoped today; add `region_id` if needed

**Mobile flow:**

1. App starts → detect region (device locale, cached `region`, or geo).
2. Call `fetchConfigBundle({ platform, environment, region })`.
3. `region` in `PublicConfigBundle` → `meta.region`.
4. Use `region` for API calls, currency, branding.

**Code changes:**

| File | Change |
|------|--------|
| `apps/web/src/app/api/public/config-bundle/route.ts` | Parse `region` from query or `X-Region` header; pass to `getPublicConfigBundle` |
| `apps/web/src/lib/config/index.ts` | `getPublicConfigBundle` accepts `region`; when present, fetch `region_settings` and merge with platform_settings |
| `apps/web/src/lib/config/types.ts` | Add `region?: string` to `GetPublicConfigBundleParams` |
| `apps/customer/src/lib/config-bundle.ts` | Add `region` to `fetchConfigBundle` params; append to URL |
| `apps/provider/src/lib/config-bundle.ts` | Same |

### 5.3 Deep links (universal links / app links)

| Current | Multi-region |
|---------|--------------|
| `applinks:beautonomi.com`, `applinks:www.beautonomi.com` | Add all region domains |

**Customer app.json:**

```json
"associatedDomains": [
  "applinks:beautonomi.com",
  "applinks:www.beautonomi.com",
  "applinks:beautonomi.co.za",
  "applinks:www.beautonomi.co.za",
  "applinks:beautonomi.co.uk",
  "applinks:beautonomi.com.au"
]
```

**Android intentFilters:** Same hosts; add each region domain.

**expo-router:** `router.origin` in `app.json` — use primary domain or dynamic; deep links use `request.url` so domain is already correct.

### 5.4 EAS build

| Aspect | Current | Multi-region |
|--------|---------|--------------|
| `EXPO_PUBLIC_APP_URL` | Single URL | Primary domain (e.g. `https://beautonomi.com`); API uses region header |
| EAS project | One per app | Same |
| EAS Secrets | One set | Same; region-specific config from API |

**Recommendation:** `EXPO_PUBLIC_APP_URL` = primary API domain. Region passed via config-bundle or header.

### 5.5 App store / Play Store

| Aspect | Single app |
|--------|-------------|
| Listings | One per platform (iOS, Android) |
| Localization | Store metadata (title, description, screenshots) per store locale |
| Region | App detects region at runtime; no separate app per country |

**Fresha-style:** Same app, different store listings per country (e.g. US vs UK) for discovery — optional; same binary.

### 5.6 OTA updates (expo-updates)

| Aspect | Single app |
|--------|-------------|
| Channel | One per environment (development, preview, production) |
| Region | No change; updates are global |

**Recommendation:** Single channel; no per-region OTA.

### 5.7 App.json / app.config.js specifics

| App | `router.origin` | `associatedDomains` | `intentFilters` |
|-----|-----------------|--------------------|-----------------|
| Customer | `https://beautonomi.com` | beautonomi.com, www | host beautonomi.com |
| Provider | Same | Same | host beautonomi.com, pathPrefix /provider |

**Multi-region:** Add all region domains to both apps. Provider `pathPrefix` stays `/provider` (path is same; domain varies).

### 5.8 EAS build profiles (eas.json)

Current profiles: `development`, `preview`, `production`. No change for multi-region; same binary, region from runtime config.

---

## 6. Web — Domain & Routing

### 6.1 Domain strategy

| Option | Example | Pros | Cons |
|--------|---------|------|------|
| **Per-region domains** | beautonomi.co.za, beautonomi.co.uk | SEO, trust, local feel | Multiple domains to manage |
| **Subdomains** | za.beautonomi.com | Single root | Less local feel |
| **Path prefix** | beautonomi.com/za/ | Single domain | SEO complexity |

**Recommendation:** Per-region domains (beautonomi.co.za, beautonomi.co.uk, etc.).

### 6.2 Network boundary (`proxy.ts`, not `middleware.ts`)

**Location:** `apps/web/src/proxy.ts` — Next.js **16** expects the **`export async function proxy`** entry here. Do **not** add `src/middleware.ts`; the framework disallows using both.

Merge any host/region logic **into** the existing `proxy` function (after imports/helpers). `matcher` stays in the same file as `export const config = { matcher: [...] }`.

```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const DOMAIN_TO_REGION: Record<string, string> = {
  "beautonomi.com": "za",
  "www.beautonomi.com": "za",
  "beautonomi.co.za": "za",
  "www.beautonomi.co.za": "za",
  "beautonomi.co.uk": "uk",
  "www.beautonomi.co.uk": "uk",
  "beautonomi.com.au": "au",
};

function getRegionFromHost(host: string): string {
  const h = host.toLowerCase();
  return DOMAIN_TO_REGION[h] ?? DOMAIN_TO_REGION[h.replace(/^www\./, "")] ?? "za";
}

// Inside `export async function proxy(request: NextRequest) { ... }`, early for HTML navigations:
function withRegionHeader(request: NextRequest): NextResponse {
  const host = request.headers.get("host") ?? "";
  const region = getRegionFromHost(host);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-region", region);
  return NextResponse.next({ request: { headers: requestHeaders } });
}
```

**API routes:** Read `request.headers.get("x-region")` in handlers that need region context.

### 6.3 Vercel

- Add all region domains in Vercel project settings.
- DNS: CNAME each domain to Vercel.
- `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` — use primary or dynamic; per-deployment env if needed.

---

## 7. Payment Gateways — Country Mapping

### 7.1 Online payments

| Region | Gateway | Currency | Notes |
|--------|---------|----------|-------|
| ZA | Paystack | ZAR | Live |
| NG | Paystack | NGN | Live |
| GH | Paystack | GHS | Live |
| KE | Paystack | KES | Live |
| UK | Stripe | GBP | Add |
| US | Stripe | USD | Add |
| EU | Stripe | EUR | Add |
| AU | Stripe | AUD | Add |

### 7.2 In-person POS

| Region | Gateway | Notes |
|--------|---------|-------|
| ZA | Yoco | Live |
| Africa (other) | Yoco | If available |
| UK | Square | Add |
| US | Square | Add |
| AU | Square | Add |

### 7.3 Payouts

| Region | Gateway | Notes |
|--------|---------|-------|
| ZA, NG, GH, KE | Paystack Transfers | Live |
| UK, US, EU, AU | Stripe Connect | Add |

---

## 8. Effort Estimates

### Phase 1: Foundation (4–5 weeks)

| Task | Effort | Owner |
|------|--------|-------|
| `regions` table + migration | 1 day | Backend |
| `region_settings`, `region_payment_gateways`, `region_secrets` | 2 days | Backend |
| `region_id` on `providers` + backfill from `provider_locations.country` | 1 day | Backend |
| `admin_region_assignments` + RLS | 2 days | Backend |
| Domain → region middleware | 1 day | Web |
| `platform-settings` API region-aware | 1 day | Web |
| `config-bundle` API region param | 1 day | Web |
| Config-bundle mobile client update | 0.5 day | Mobile |

### Phase 2: Admin & Auth (2–3 weeks)

| Task | Effort | Owner |
|------|--------|-------|
| Region-scoped admin role checks | 2 days | Backend |
| Admin UI region context | 2 days | Web |
| RLS for region-scoped admins on providers, bookings, etc. | 3 days | Backend |
| Admin region selector / filter | 1 day | Web |

### Phase 3: Payments (3–4 weeks)

| Task | Effort | Owner |
|------|--------|-------|
| `region_payment_gateways` + `region_secrets` wiring | 2 days | Backend |
| Paystack region selection | 1 day | Backend |
| Stripe integration (new) | 5–7 days | Backend |
| Webhook routing by region | 2 days | Backend |
| Yoco region gating | 0.5 day | Backend |
| Provider onboarding region-aware | 1 day | Web |
| Mobile payment flow region-aware | 1 day | Mobile |

### Phase 4: Web Multi-Domain (1–2 weeks)

| Task | Effort | Owner |
|------|--------|-------|
| Vercel multi-domain config | 0.5 day | DevOps |
| All env vars / URLs per domain | 1 day | DevOps |
| `NEXT_PUBLIC_SITE_URL` dynamic | 0.5 day | Web |
| SEO: sitemap per region, hreflang | 2 days | Web |
| Deep links: add all domains to app.json | 0.5 day | Mobile |

### Phase 5: Integrations (2–3 weeks)

| Task | Effort | Owner |
|------|--------|-------|
| Amplitude region in identify/events | 1 day | Full-stack |
| OneSignal region (optional) | 0.5 day | Backend |
| Mapbox region token (optional) | 0.5 day | Backend |
| Calendar OAuth redirect URIs per domain | 1 day | DevOps |
| Twilio region (optional) | 1 day | Backend |
| Sumsub region config | 1 day | Backend |
| Singular region in links | 0.5 day | Marketing |
| Sentry region context | 0.5 day | Full-stack |

### Phase 6: i18n & Content (1–2 weeks)

| Task | Effort | Owner |
|------|--------|-------|
| Add new locales (pt-BR, es, fr, etc.) | 2–3 days | i18n |
| Region-specific CMS content | 2 days | Web |
| Legal pages per region (terms, privacy) | 2 days | Backend + Content |

---

## 9. Effort Summary

| Phase | Duration | Effort (person-weeks) |
|-------|----------|------------------------|
| Phase 1: Foundation | 4–5 weeks | 2–2.5 |
| Phase 2: Admin & Auth | 2–3 weeks | 1–1.5 |
| Phase 3: Payments | 3–4 weeks | 2–2.5 |
| Phase 4: Web Multi-Domain | 1–2 weeks | 0.5–1 |
| Phase 5: Integrations | 2–3 weeks | 1–1.5 |
| Phase 6: i18n & Content | 1–2 weeks | 0.5–1 |
| **Total** | **12–18 weeks** | **7.5–10** |

*Assumes 1–2 engineers; parallelization can reduce calendar time.*

---

## 10. Migration Path

1. **Week 1–2:** Add `regions` table; seed ZA region; no behaviour change.
2. **Week 3–4:** Add `region_id` to providers; backfill from primary location country; default all to ZA.
3. **Week 5–6:** Middleware + config-bundle region; single domain still works.
4. **Week 7–8:** Add second region (e.g. UK); domain routing; region-scoped admin.
5. **Week 9–12:** Stripe for UK; payment gateway selection; webhook routing.
6. **Week 13–14:** Multi-domain Vercel; deep links; SEO.
7. **Week 15–18:** Remaining integrations; i18n; content; testing.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Payment gateway complexity | Start with Paystack-only regions; add Stripe later |
| RLS performance | Index `region_id`; test with large datasets |
| Domain DNS | Plan DNS early; use Vercel for simplicity |
| OAuth redirect URIs | Register all domains in Google/Outlook consoles before deploy |
| Mobile app store | Single app; no region-specific app store complexity |

---

## 12. Additional Considerations

### 12.1 Notification templates

| Current | Multi-region |
|---------|--------------|
| `notification_templates` (platform-wide) | Add `region_id` (nullable) for region-specific templates |
| Email/SMS content | Region can override default templates |
| Links in notifications | Use region domain for `NEXT_PUBLIC_APP_URL` in links |

**Effort:** 1–2 days to add `region_id` to templates and resolve by region.

### 12.2 Supabase

| Aspect | Single project | Multi-region |
|--------|----------------|--------------|
| Project | One | One (recommended for Phase 1) |
| RLS | Provider-scoped | Add region filter for admin RLS |
| Realtime | Same | Same; channels can include region |
| Storage | Same | Same; paths can include region |

**Alternative:** Separate Supabase project per region (Airbnb-style) — higher effort; consider only at scale.

### 12.3 Legal & compliance

| Region | Considerations |
|--------|-----------------|
| ZA | POPIA, CPA |
| UK | GDPR, Consumer Rights |
| EU | GDPR, PSD2 |
| US | State privacy laws, PCI-DSS |
| AU | Privacy Act |

**Effort:** 2–4 weeks (legal review + implementation) per new region; varies by jurisdiction.

### 12.4 Cron jobs

| Job | Path | Schedule | Multi-region |
|-----|------|----------|--------------|
| send-reminders | `/api/cron/send-reminders` | 0 9 * * * | Add region filter in queries |
| expire-booking-holds | `/api/cron/expire-booking-holds` | 0 1 * * * | Same |
| expire-on-demand-requests | `/api/cron/expire-on-demand-requests` | 0 2 * * * | Same |
| execute-automations | `/api/cron/execute-automations` | 0 6 * * * | Same |
| process-recurring-bookings | `/api/cron/process-recurring-bookings` | 0 0 * * * | Same |
| check-low-stock | `/api/cron/check-low-stock` | 0 8 * * * | Same |

**Recommendation:** Cron jobs iterate over active regions; or single run with `WHERE region_id = ...` (or `provider.region_id = ...`) in queries. No new cron routes needed.

### 12.5 Feature flags

| Current | Multi-region |
|---------|--------------|
| `feature_flags` table | Add `region_id` (nullable) for region-specific overrides |
| `resolveFlagsForUser` in `apps/web/src/lib/config/index.ts` | Pass region; resolve flags with region override |

**Effort:** 1 day to add region override support.

### 12.6 Control plane modules (env-scoped today)

| Table | Env column | Multi-region |
|-------|------------|--------------|
| `amplitude_integration_config` | `environment` | Add `region_id` (nullable) for per-region Amplitude |
| `gemini_integration_config` | `environment` | Keep env; or add `region_id` for region-specific AI |
| `sumsub_integration_config` | `environment` | Add `region_id` for region-specific KYC levels |
| `aura_integration_config` | `environment` | Same |
| `on_demand_module_config` | `environment` | Same |
| `ai_module_config`, `ads_module_config`, etc. | `environment` | Same |

**Recommendation:** Start with env-scoped; add `region_id` when a region needs different config.

### 12.7 Migration naming

New migrations go in `supabase/migrations/` with next sequence number (e.g. `286_regions_table.sql`, `287_region_settings.sql`). Follow existing pattern: descriptive name, idempotent where possible.

---

## 13. References

- [AUDIT_FRESHA_COMPARISON.md](./AUDIT_FRESHA_COMPARISON.md) — Fresha feature parity
- [INTEGRATIONS.md](./INTEGRATIONS.md) — Platform integrations
- [ENVIRONMENT_MATRIX.md](./ENVIRONMENT_MATRIX.md) — Env vars
- [DEPLOYMENT_EAS.md](./DEPLOYMENT_EAS.md) — Mobile deployment
- [PRICING_AND_SUBSCRIPTION_PLANS.md](./PRICING_AND_SUBSCRIPTION_PLANS.md) — Provider billing
- [FEE_MANAGEMENT_AND_REVENUE.md](./FEE_MANAGEMENT_AND_REVENUE.md) — Fee reconciliation
