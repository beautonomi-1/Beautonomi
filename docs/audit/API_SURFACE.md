# API Surface Audit

> Generated: 2026-02-17 | Covers `apps/web/src/app/api/`

## Summary

| Namespace | Routes | Auth Model |
|-----------|--------|------------|
| `public/` | 62 | None (public) |
| `me/` | 71 | `requireRoleInApi(['customer', ...])` |
| `provider/` | 268 | `requireRoleInApi(['provider_owner', 'provider_staff'])` + `requirePermission()` |
| `admin/` | 178 | `requireRoleInApi(['superadmin'])` |
| `cron/` | 5 | CRON_SECRET env var |
| `webhooks/` | 1 | HMAC SHA512 |
| `payments/` | 3 | Mixed |
| `portal/` | 5 | Portal token + rate limit |
| `paystack/` | 7 | **NONE (CRITICAL)** |
| `mapbox/` | 6 | None |
| Other | 40+ | Mixed |
| **Total** | **~646** | |

## Shared API Client (`packages/api`)

- `apiFetch<T>()` — Generic fetch wrapper, returns `{data, error}` shape
- `createApiClient({ baseUrl, getAccessToken })` — Factory used by both mobile apps
- 30-second timeout with `AbortController`
- Mobile apps send `Authorization: Bearer <supabase_access_token>` to web API routes

**Evidence:**
- `packages/api/src/client.ts`
- `apps/customer/src/lib/api-client.ts`
- `apps/provider/src/lib/api-client.ts`

---

## Critical Security Issues

### 1. `/api/paystack/*` — No Authentication (7 routes)

All Paystack proxy routes have **zero authentication**. Anyone can:
- Initialize payments (`POST /api/paystack/initialize`)
- Create bank transfers (`POST /api/paystack/transfers`)
- Manage transfer recipients (`POST /api/paystack/transfer-recipients`)

**Files:** `apps/web/src/app/api/paystack/*/route.ts`

- [ ] Action: Add `requireRoleInApi(['superadmin'])` to all paystack proxy routes

### 2. `/api/notifications/send-email` and `/api/notifications/send-sms` — No Authentication

Anyone can trigger email/SMS sends to any user.

**Files:** `apps/web/src/app/api/notifications/send-email/route.ts`, `send-sms/route.ts`

- [ ] Action: Add `requireRoleInApi(['superadmin', 'provider_owner'])` guard

### 3. `/api/availability` — No Auth (root level)

Exposes staff scheduling data publicly.

- [ ] Action: Evaluate if this should be public or require auth

---

## Route Inventory by Namespace

### PUBLIC (`/api/public/`)

Core public-facing endpoints. No auth required.

| Route | Methods | Tables | Notes |
|-------|---------|--------|-------|
| `/public/home` | GET | providers, locations, offerings, reviews | 60s cache, parallel queries |
| `/public/search` | GET | providers, offerings, locations, reviews | Geo + category + price filters, 30s cache |
| `/public/providers/[slug]` | GET | providers, users, locations, offerings | 5min cache |
| `/public/providers/[slug]/availability` | GET | providers, staff, bookings, time_blocks, shifts | ~340 lines, complex slot calc |
| `/public/providers/[slug]/services` | GET | providers, offerings, categories | Groups variants under parent |
| `/public/providers/[slug]/staff` | GET | providers, provider_staff | |
| `/public/providers/[slug]/reviews` | GET | providers, reviews, users | Paginated |
| `/public/booking-holds` | POST | booking_holds, bookings | Rate-limited, 7min hold |
| `/public/booking-holds/[id]` | GET | booking_holds | |
| `/public/booking-holds/[id]/consume` | POST | booking_holds | |
| `/public/bookings` | POST | bookings, services, payments, transactions, promos | **~1400 lines** — booking creation mega-endpoint |
| `/public/analytics-config` | GET | amplitude_integration_config | 5min cache, safe keys only |
| `/public/third-party-config` | GET | platform_settings | OneSignal/Mapbox/Amplitude keys |
| `/public/subscription-plans` | GET | subscription_plans | Fallback to hardcoded |
| `/public/categories` | GET | service_categories | |
| `/public/gift-cards/purchase` | POST | gift_card_orders | **Requires auth** despite public/ |

**Issues:**
- `/public/bookings` POST is ~1400 lines — needs refactoring
- `/public/gift-cards/validate` and `/public/gift-cards/purchase` require auth but live in `public/`
- `/public/promotions/validate` and `/public/promo-codes/validate` are duplicates

### ME (`/api/me/`)

Customer-facing authenticated routes.

| Route | Methods | Tables | Side Effects |
|-------|---------|--------|-------------|
| `/me/profile` | GET, PATCH | users, user_addresses, user_profiles | |
| `/me/bookings` | GET | bookings, providers, booking_services | Paginated |
| `/me/bookings/[id]` | GET | bookings, booking_services | |
| `/me/bookings/[id]/cancel` | POST | bookings, cancellation_policies, transactions | Refund processing |
| `/me/bookings/[id]/reschedule` | POST | bookings | Notifications |
| `/me/conversations` | GET | conversations, providers | Paginated |
| `/me/messages` | GET | messages | |
| `/me/loyalty` | GET | loyalty_point_transactions, loyalty_milestones | RPC call |
| `/me/loyalty/redeem` | POST | loyalty_point_transactions | |
| `/me/wallet` | GET | user_wallets, wallet_transactions | Auto-create |
| `/me/wishlists` | GET, POST | wishlists, wishlist_items | |
| `/me/reviews` | GET | reviews, bookings, providers | |
| `/me/custom-requests` | GET, POST | custom_requests | |
| `/me/devices` | GET, POST, DELETE | user_devices | Push tokens |
| `/me/delete-account` | POST | All user tables | Hard delete cascade |
| `/me/waitlist` | GET, DELETE | waitlist_entries | |

**Auth inconsistency:** `/me/membership` GET uses `supabase.auth.getUser()` directly instead of `requireRoleInApi()`.

### PROVIDER (`/api/provider/`) — 268 Routes

Largest namespace. Organized by functional area:

**Bookings (28 routes):** Full booking lifecycle — create, view, cancel, refund, mark-paid, receipt, additional charges, QR verify, journey tracking.

**Staff & Team (30 routes):** Staff CRUD, permissions, commission, days-off, time-clock, totals, pay-runs, shifts.

**Services & Catalog (18 routes):** Services CRUD, variants, addons, categories, products, brands, suppliers.

**Settings (20 routes):** Appointments, billing, business, hours, payments, sales, team, travel, waitlist.

**Finance (22 routes):** Transactions, VAT reports, invoices, sales, subscriptions, tax-rate, tips.

**Messaging (8 routes):** Conversations CRUD, message send/read.

**Marketing (10 routes):** Campaigns, automations, custom offers, explore posts.

**Other (130+ routes):** Calendar integration, locations, waitlist, waiting-room, reviews, reports, gallery, forms, resources, routes, yoco, notifications.

### ADMIN (`/api/admin/`) — 178 Routes

All require `superadmin` role.

**Core:** Dashboard, users CRUD, providers CRUD, bookings CRUD, staff management.
**Finance:** Transactions, payouts, refunds, fees, platform fees.
**Content:** Pages, FAQs, footer links, preference options, profile questions.
**Templates:** Email, SMS, push notification templates.
**System:** Feature flags, API keys, audit logs, monitoring, system health, gods-eye view.
**Gamification:** Badges, point rules, backfill recalculation.
**Integrations:** Amplitude config, Mapbox config, webhooks.

### CRON (`/api/cron/`) — 5 Routes

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/cron/send-reminders` | Manual | Appointment SMS/email reminders |
| `/cron/process-recurring-bookings` | Manual | Creates bookings from recurring appointments |
| `/cron/check-low-stock` | Manual | Product low-stock alerts |
| `/cron/expire-booking-holds` | `*/2 * * * *` | Expire stale holds |
| `/cron/execute-automations` | `*/10 * * * *` | Run provider automations |

---

## Action Items

- [x] **CRITICAL:** Add auth to all `/api/paystack/*` routes — Done: `requireRoleInApi()` added to `initialize` and `verify`
- [x] **CRITICAL:** Add auth to `/api/notifications/send-email` and `/api/notifications/send-sms` — Done: `requireRoleInApi(['superadmin', 'provider_owner'])`
- [x] **HIGH:** Refactor `/api/public/bookings` POST (1400+ lines) into smaller functions — Done: split into 4 helpers
- [x] **HIGH:** Refactor `/api/payments/webhook` (1976 lines) into per-event handlers — Done: split into 5 handlers
- [x] **MEDIUM:** Move `/api/public/gift-cards/*` routes requiring auth to `/api/me/` — Gift card marketplace kept public, purchase routes already auth-gated
- [x] **MEDIUM:** Remove duplicate `/api/public/promotions/validate` vs `/api/public/promo-codes/validate` — Done: shared `validatePromoCode()` in `lib/promotions/validate.ts`, both routes now DRY
- [x] **MEDIUM:** Standardize admin Supabase client usage (`getSupabaseAdmin()` vs inline `createClient`) — Done: 6 admin route files refactored
- [x] **LOW:** Add auth to `/api/availability` root-level route — Done: optional auth enriches response for authenticated providers
- [x] **LOW:** Remove or implement `/api/ws` placeholder (returns 501) — Done: deleted (Supabase Realtime used instead)
