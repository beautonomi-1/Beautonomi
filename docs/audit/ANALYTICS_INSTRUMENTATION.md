# Analytics Instrumentation Audit

> Generated: 2026-02-17

## Architecture

```
┌─────────────────────────────────┐
│  Superadmin Portal              │
│  /admin/integrations/amplitude  │
│  (manages keys + config)        │
└─────────┬───────────────────────┘
          │ writes to
          ▼
┌─────────────────────────────────┐
│  amplitude_integration_config   │
│  (Supabase table)               │
│  Per-environment settings       │
└─────────┬───────────────────────┘
          │ fetched by
          ▼
┌─────────────────────────────────────────────────────┐
│  /api/public/analytics-config?environment=<env>     │
│  (5-min cache, strips server keys)                  │
└──────┬──────────────┬───────────────┬───────────────┘
       │              │               │
       ▼              ▼               ▼
   Customer App   Provider App     Web App
   (RN SDK)       (RN SDK)        (Browser SDK + Server)
```

## Config Schema (`amplitude_integration_config`)

| Field | Purpose |
|-------|---------|
| `api_key_client` | Browser/mobile Amplitude API key |
| `api_key_server` | Server-side Amplitude API key (never sent to client) |
| `environment` | `development`, `staging`, `production` |
| `enabled_client_portal` | Toggle for customer-facing tracking |
| `enabled_provider_portal` | Toggle for provider-facing tracking |
| `enabled_admin_portal` | Toggle for admin tracking |
| `enable_guides` | Amplitude Guides feature flag |
| `enable_surveys` | Amplitude Surveys feature flag |
| `sampling_rate` | Percentage of events to send (0-100) |
| `debug_mode` | Console logging of events |

**Evidence:** `beautonomi/supabase/migrations/229_amplitude_integration.sql`

---

## Current Event Taxonomy

### Customer Mobile App (20 events)

**File:** `apps/customer/src/lib/analytics.ts`

| Event | Properties | Notes |
|-------|-----------|-------|
| `sign_up` | method | |
| `login` | method | |
| `logout` | — | |
| `booking_started` | provider_id, service_id | ⚠️ Web uses `booking_start` |
| `service_selected` | service_id, price | |
| `booking_completed` | booking_id, total | ⚠️ Web uses `booking_confirmed` |
| `booking_failed` | error | |
| `booking_cancelled` | booking_id, reason | |
| `search` | query, filters | |
| `category_filter` | category_id | |
| `provider_viewed` | provider_id | ⚠️ Web uses `provider_profile_view` |
| `wishlist_toggle` | provider_id, action | |
| `review_submitted` | provider_id, rating | |
| `share_provider` | provider_id, channel | |
| `explore_post_viewed` | post_id | |
| `explore_post_liked` | post_id | |
| `payment_method_selected` | method | |
| `gift_card_purchased` | amount | |
| `custom_request_created` | category | |
| `notification_opened` | type | |

### Web App (77 events)

**File:** `apps/web/src/lib/analytics/amplitude/types.ts`

| Category | Events | Count |
|----------|--------|-------|
| Session | session_start, session_end | 2 |
| Auth | signup_start, signup_complete, login_success, logout | 4 |
| Browse | home_view, category_view, search_view, filters, impressions, clicks, provider_profile_view | 7 |
| Explore | feed_view, post_impression, post_click, save, unsave | 5 |
| Booking | booking_start, hold_created, details_completed, confirmed, cancelled, rescheduled | 6 |
| Payment | checkout_start, payment_initiated, success, failed, refund_requested | 5 |
| Messaging | message_thread_open, message_sent | 2 |
| Reviews | review_submitted | 1 |
| Navigation | page_view | 1 |
| Provider Portal | 22 events covering dashboard, calendar, front desk, waitlist, payments, staff, explore, marketing, settings | 22 |
| Admin Portal | 16 events covering dashboard, verification, impersonation, payouts, refunds, API keys, feature flags, moderation | 16 |

### User Properties (Identify)

**File:** `apps/web/src/lib/analytics/amplitude/identify.ts`

| Property | Scope | Populated By |
|----------|-------|-------------|
| user_id, role, device_type | All users | Auth state |
| provider_id, provider_status, business_type, is_verified | Providers | Provider profile |
| subscription_tier, locations_count, staff_count | Providers | Provider data |
| yoco_enabled, paystack_subaccount_status | Providers | Integration status |
| total_bookings, total_revenue | Providers | Aggregated |
| location_id | Staff | Staff assignment |
| lifetime_bookings, last_booking_date | Customers | Booking history |
| favorite_categories, loyalty_points | Customers | Profile data |
| membership_plan_id | Customers | Membership |
| country, city | All | Address/location |

---

## Web Plugin Pipeline

**File:** `apps/web/src/lib/analytics/amplitude/plugins/`

| Plugin | Order | Purpose |
|--------|-------|---------|
| EnrichmentPlugin | 1 | Adds `app_version`, `platform`, `portal`, `route`, `referrer`, `timezone` |
| PrivacyPlugin | 2 | Strips PII: `email`, `phone`, `password`, `credit_card`, `ssn`, etc. |
| ReliabilityPlugin | 3 | Sampling rate, offline queue (localStorage), batch flush |
| DebugPlugin | 4 | Console logging when `debug_mode` enabled |

---

## Issues Found

### 1. Event Naming Mismatch (Mobile vs Web)

| Mobile Event | Web Event | Impact |
|-------------|-----------|--------|
| `booking_started` | `booking_start` | Fragmented funnel analysis |
| `booking_completed` | `booking_confirmed` | Booking count mismatch |
| `provider_viewed` | `provider_profile_view` | Provider analytics broken |
| `explore_post_viewed` | `explore_post_impression` | Explore metrics split |

**Action:** Standardize to web naming convention (noun_verb pattern) across all platforms.

### 2. Mobile Identify Gap

Mobile `AnalyticsProvider` only sets `phone` as user property. Web sets 20+ properties.

**Impact:** Mobile users have no `country`, `city`, `lifetime_bookings`, `favorite_categories` etc. in Amplitude. Segmentation and cohort analysis will be incomplete.

### 3. ReliabilityPlugin Queue Never Flushes

`flushQueue()` removes events from localStorage but never actually sends them — the comment says "handled by the Amplitude SDK" but the queue was custom-built precisely because of SDK gaps.

**Evidence:** `apps/web/src/lib/analytics/amplitude/plugins/reliability-plugin.ts`

### 4. Server-Side Config Not Cached

`apps/web/src/lib/analytics/amplitude/server.ts` queries `amplitude_integration_config` on every server-side track call. No caching.

### 5. Provider Mobile App Has No Analytics Events

The provider `AnalyticsProvider.tsx` initializes the SDK but there are no tracked events in provider app code.

---

## Proposed Event Taxonomy

### Standard Naming Convention

`{object}_{action}` in lowercase snake_case.

### Minimum Viable Tracking — Customer Conversion Funnel

| Funnel Stage | Event | Properties |
|-------------|-------|-----------|
| Awareness | `home_view` | referrer, landing_variant |
| Discovery | `search_performed` | query, filters, results_count |
| | `search_result_clicked` | provider_id, position |
| | `provider_profile_viewed` | provider_id, source |
| Consideration | `service_selected` | service_id, provider_id, price |
| | `booking_started` | provider_id, service_ids, total |
| | `booking_hold_created` | hold_id, duration |
| Conversion | `checkout_started` | booking_id, total, payment_method |
| | `payment_initiated` | booking_id, method, amount |
| | `booking_confirmed` | booking_id, total, services_count |
| Retention | `booking_completed` | booking_id, rating_prompted |
| | `review_submitted` | booking_id, rating |
| | `rebooking_prompted` | provider_id, days_since_last |
| Loyalty | `loyalty_points_earned` | points, action |
| | `loyalty_redeemed` | points, discount |
| | `referral_shared` | channel |

### Provider Analytics Metrics

| Metric | Source Events |
|--------|-------------|
| Profile views | `provider_profile_viewed` (group by provider_id) |
| Booking requests | `booking_started` (group by provider_id) |
| Conversion rate | `booking_confirmed` / `provider_profile_viewed` |
| Average order value | avg of `booking_confirmed.total` |
| Revenue | sum of `payment_success.amount` |
| Repeat rate | `booking_confirmed` where `is_repeat = true` |
| Rating trend | avg of `review_submitted.rating` over time |

### Surveys (Already Implemented)

| Survey | Trigger | Frequency |
|--------|---------|-----------|
| Post-booking CSAT | After booking completion | 1 per 30 days |
| Post-payout satisfaction | After provider payout | 1 per 90 days |
| Quarterly NPS | After 90 days since last | 1 per 90 days |

---

## Action Items

- [x] **HIGH:** Standardize event names across mobile and web — Done: customer mobile events renamed to match web (`booking_start`, `booking_confirmed`, etc.)
- [x] **HIGH:** Add user properties to mobile analytics identify — Done: 10+ properties added to customer `identifyUser()` and provider `identifyProvider()`
- [x] **HIGH:** Add analytics events to provider mobile app — Done: 30+ events in `apps/provider/src/lib/analytics.ts`
- [x] **MEDIUM:** Fix ReliabilityPlugin queue flush (actually send queued events) — Done: events re-submitted via `amplitude.track()`, exponential backoff, 7-day staleness discard
- [x] **MEDIUM:** Add server-side config caching — Done: in-memory cache with 5-minute TTL in `server.ts`
- [x] **MEDIUM:** Implement minimum viable funnel tracking on mobile — Done: full funnel from `booking_start` to `referral_shared`
- [x] **LOW:** Add provider-facing analytics dashboard events — Done: `provider_analytics_view` + analytics screen in provider app
- [x] **LOW:** Document event taxonomy for future developers — Done: `docs/analytics/EVENT_TAXONOMY.md` with 41 events, naming conventions, user properties
