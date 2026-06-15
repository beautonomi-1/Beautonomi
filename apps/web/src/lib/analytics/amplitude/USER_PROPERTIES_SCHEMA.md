# Amplitude User Properties Schema (CDP + Product Analytics)

Single source of truth for user traits sent to Amplitude. All surfaces (web, customer app, provider app) use this schema via the server identify API.

## PII Policy

We do **not** send raw PII (email, phone, full_name) to Amplitude. We send only:

- Non-PII flags: `has_email`, `has_phone`, `has_name` (boolean)
- All other traits listed below (no PII)

Event properties (track) are redacted by PrivacyPlugin (see `plugins/privacy.ts`). User properties (identify) are built server-side and never include raw PII.

---

## Canonical property list

| Property | Type | Source | PII | Analysis | Activation | Notes |
|----------|------|--------|-----|----------|------------|-------|
| user_id | string | auth | No | Yes | Yes | Required; stable identifier |
| role | string | auth | No | Yes | Yes | customer \| provider_owner \| provider_staff (superadmin is not tracked) |
| portal | string | client | No | Yes | Yes | client \| provider \| admin |
| platform | string | client | No | Yes | Yes | web \| ios \| android |
| device_type | string | client | No | Yes | Yes | desktop \| mobile \| tablet |
| preferred_language | string \| null | users | No | Yes | Yes | |
| signup_source | string \| null | users | No | Yes | Yes | |
| country | string | user_addresses / provider_locations | No | Yes | Yes | |
| city | string | user_addresses / provider_locations | No | Yes | Yes | |
| has_email | boolean | derived | No | Yes | Yes | True if user has email set |
| has_phone | boolean | derived | No | Yes | Yes | True if user has phone set |
| has_name | boolean | derived | No | Yes | Yes | True if user has full_name set |
| analytics_consent | boolean | user_profiles.privacy_settings | No | Yes | Yes | Default true; gate init/identify when false |

### Customer-only

| Property | Type | Source | PII | Analysis | Activation |
|----------|------|--------|-----|----------|------------|
| lifetime_bookings | number | bookings count | No | Yes | Yes |
| last_booking_date | string | bookings | No | Yes | Yes | ISO date |
| loyalty_points | number | user_wallets | No | Yes | Yes |
| membership_plan_id | string \| null | membership_orders | No | Yes | Yes | UUID or null |
| plan_tier | string | derived | No | Yes | Yes | "member" \| "none" |
| favorite_categories | string[] | user_profiles.beauty_preferences | No | Yes | Yes | Category hints from preferences |

### Provider-only

| Property | Type | Source | PII | Analysis | Activation |
|----------|------|--------|-----|----------|------------|
| provider_id | string | provider_staff / users | No | Yes | Yes | UUID |
| location_id | string | provider_staff | No | Yes | Yes | Staff only |
| provider_status | string | providers | No | Yes | Yes | |
| business_type | string | providers | No | Yes | Yes | |
| is_verified | boolean | providers | No | Yes | Yes | |
| subscription_tier | string | providers | No | Yes | Yes | |
| plan_tier | string | derived | No | Yes | Yes | subscription_tier \|\| "free" |
| locations_count | number | provider_locations count | No | Yes | Yes | |
| staff_count | number | provider_staff count | No | Yes | Yes | |
| yoco_enabled | boolean | yoco_devices | No | Yes | Yes | |
| paystack_subaccount_status | string \| null | provider_paystack_subaccounts | No | Yes | Yes | |
| total_bookings | number | bookings completed | No | Yes | Yes | |
| total_revenue | number | bookings completed | No | Yes | Yes | |

---

## Forbidden in user properties

- email
- phone
- full_name
- phone_number
- Any other raw PII (see PrivacyPlugin denylist for event properties)

---

## Session replay & consent (behavior)

- **Web:** Session Replay (Amplitude browser plugin) is enabled only for **authenticated** sessions that pass the consent check. Anonymous visitors get events (when the portal is enabled) **without** session replay. If `/api/me/analytics/consent` is missing, errors, or returns non-OK, the SDK is **not** initialized for that user (fail-closed). **Superadmin** never loads the Amplitude SDK (no events, no identify).
- **Mobile (Expo):** Amplitude Session Replay is not loaded. Logged-in users still use the same fail-closed analytics consent rule as web (API error → no init).
- **Identify:** User traits are sent to Amplitude only from **POST /api/me/analytics/identify** responses. Clients do not fall back to partial / client-only identify on API failure.

## Implementation

- **Web:** `identify.ts` builds properties; `AmplitudeProvider` calls `fetchIdentifyProperties` → POST /api/me/analytics/identify.
- **Mobile:** Customer and provider apps call POST /api/me/analytics/identify with overrides (portal, platform, device_type) and pass the **returned object only** to `identify`.
- **Consent:** When `analytics_consent` is false, clients skip Amplitude init and identify; the identify API remains available so that when consent is granted again, the same schema applies.
