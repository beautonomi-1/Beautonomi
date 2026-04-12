# Provider Platform End-to-End Audit Report

**Date:** 2026-04-12
**Scope:** Provider mobile app (`apps/provider`) + Provider web portal (`apps/web/src/app/provider/`) + Provider API (`apps/web/src/app/api/provider/`) + Database schema

---

## 1. Executive Summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Overall implementation health** | 7.5/10 | Large, feature-rich platform with strong core but several cross-platform inconsistencies |
| **Settings enforcement** | 6.5/10 | Many settings stored but not consumed where they should be; calendar preferences not synced |
| **API contract integrity** | 7/10 | Server normalizes divergent payloads well, but optional fields and response shapes vary |
| **DB schema alignment** | 6/10 | `Database = any` eliminates compile-time safety; schema is extensive but types are unverified |
| **UI completeness** | 8/10 | Both mobile (211 screens) and web (163 pages) are feature-rich; parity is mostly good |

### Top Critical Risks

1. **Booking status bypass** — Mobile and web booking detail screens use PATCH `status` instead of `start-service`/`complete-service` endpoints, bypassing at-home arrival verification enforcement
2. **Calendar preferences never sync** — Mobile uses AsyncStorage only; web has sync function but calendar page doesn't call it; provider prefs don't transfer across devices
3. **Notification preferences permission mismatch** — PATCH endpoint restricts to `provider_owner`/`superadmin` but mobile shows the settings screen to all staff
4. **`Database = any`** — No compile-time type safety for any Supabase query across the entire platform

### Top Quick Wins

1. Add `onError` guard in mobile notification-preferences screen for staff role
2. Wire web calendar to call `syncPreferencesToServer` on save
3. Add mobile API call to load calendar preferences from server on app launch
4. Align subscription plan endpoints to return consistent shapes

### Top Strategic Improvements

1. Generate real Supabase types from schema (`supabase gen types`)
2. Unify booking state machine via dedicated transition endpoints
3. Implement shared validation library (Zod schemas shared between mobile and API)
4. Build cross-device settings sync for calendar preferences

---

## 2. Repository / System Map

### Provider Mobile App (`apps/provider/`)
- **211 screen files** under `app/` (Expo Router)
- **111 source files** under `src/` (components, hooks, features, lib, providers)
- Navigation: Root Stack → Auth Stack OR App Stack → Tabs (dashboard, calendar, clients, chats, more) → More Stack (~170 screens) → Settings Stack
- State: React Context (Auth, Provider, Theme, ConfigBundle, Analytics, PushNotifications, NotificationsCount)
- API client: `@beautonomi/api` wrapper with Bearer token + 401 refresh

### Provider Web Portal (`apps/web/src/app/provider/`)
- **163 page files** (Next.js App Router)
- Shell: `ProviderShell` (sidebar, topbar, bottom nav) with `usePermissions()` gating
- State: `ProviderPortalProvider` (profile + locations + setup)
- API client: `providerApi` class in `lib/provider-portal/api.ts`

### Provider API (`apps/web/src/app/api/provider/`)
- **366 route handler files** covering all provider domains
- Auth: `requireRoleInApi` with Bearer (mobile) and cookie session (web)
- Response envelope: `{ data, error }` via `successResponse`/`errorResponse`
- DB access: `getSupabaseAdmin()` (service role) for most reads/writes after auth

### Database
- **Hundreds of migration files** in `supabase/migrations/`
- Core provider tables: `providers`, `provider_locations`, `provider_staff`, `provider_roles`, `provider_settings`, `provider_online_booking_settings`, `offerings`, `bookings`
- Settings: `platform_settings` (global JSONB), `tenant_settings`, `feature_flags`, `provider_settings` (per-provider JSONB)
- Types: `packages/types/src/database.ts` exports `Database = any`

### Shared Packages
- `@beautonomi/types` — `UserRole`, `ApiResponse`, `Database = any`
- `@beautonomi/admin-access` — Admin RBAC sections and roles
- `@beautonomi/api` — HTTP client wrapper used by mobile
- `@beautonomi/utils` — Shared utilities

---

## 3. Complete Settings Inventory

### A. Calendar Preferences

| Attribute | Value |
|-----------|-------|
| **Storage** | `provider_settings.calendar_preferences` (JSONB) |
| **API** | `GET/PATCH /api/provider/settings/calendar-preferences` |
| **Fields** | `slotIncrement`, `workdayStartHour`, `workdayEndHour`, `showCanceled`, `showNoShow`, `colorBy`, `defaultView`, `weekStartsOn` |
| **Mobile consumption** | `useCalendarPreferences` — **AsyncStorage only**, never reads from API |
| **Web consumption** | `calendarPreferences.ts` has `syncPreferencesToServer` implemented but **CalendarClient does not call it** |
| **Available-slots API** | Does NOT read `calendar_preferences`; uses location `working_hours` + fixed 6:00–22:00 grid |
| **Status** | ❌ NOT ENFORCED — stored in DB but consumed locally on each device independently |

### B. Appointment/Booking Settings

| Attribute | Value |
|-----------|-------|
| **Storage** | `provider_settings` (appointments JSONB), `provider_online_booking_settings` |
| **API** | `GET/PATCH /api/provider/settings/appointments`, `GET/PATCH /api/provider/settings/online-booking` |
| **Fields** | `default_duration`, `buffer_time`, `max_advance_days`, `min_advance_hours`, `auto_confirm`, `allow_double_booking`, `gap_avoidance`, `online_booking_enabled`, `deposit_required`, `deposit_percentage` |
| **Booking creation** | POST `/api/provider/bookings` checks `checkBookingConflict`, `isProviderCalendarWindowBlocked`, `checkActiveHoldOverlap`; reads `allow_double_booking` from `provider_settings` |
| **Public booking** | `validate-booking.ts` checks `online_booking_enabled`, advance limits, availability |
| **Status** | ✅ Mostly enforced — buffer_time and gap_avoidance are checked in conflict detection |

### C. Notification Preferences

| Attribute | Value |
|-----------|-------|
| **Storage** | `provider_notification_preferences` (JSONB per user) |
| **API** | `GET/PATCH /api/provider/notification-preferences` |
| **GET roles** | `provider_owner`, `provider_staff`, `superadmin` |
| **PATCH roles** | `provider_owner`, `superadmin` **only** — staff excluded |
| **Mobile** | Shows to all provider roles; sends `quiet_hours_*` and `digest_mode` (not in server schema) |
| **Missing on mobile** | `review_responses`, `unsubscribe_marketing` categories |
| **Status** | ⚠️ PARTIAL — permission mismatch; extra fields passed through via `.passthrough()` |

### D. Payment/Billing Settings

| Attribute | Value |
|-----------|-------|
| **Storage** | `provider_settings` payments fields, Yoco integration tables |
| **API** | `GET/PATCH /api/provider/settings/payments`, `/yoco/*` endpoints |
| **Mobile** | Full Yoco device management, payment method config |
| **Web** | Full Yoco integration, device pairing, payment flows |
| **Status** | ✅ Well-aligned — both platforms use same endpoints |

### E. Distance/Travel Settings

| Attribute | Value |
|-----------|-------|
| **Storage** | `provider_travel_fee_settings`, `provider_settings` |
| **API** | `GET/PATCH /api/provider/distance-settings`, `GET/PATCH /api/provider/travel-fees` |
| **Enforcement** | Public booking calculates travel fees via `public/travel-fees/[providerId]` |
| **Status** | ✅ Enforced in booking flow |

### F. Operating Hours

| Attribute | Value |
|-----------|-------|
| **Storage** | `provider_locations.working_hours` (JSONB) |
| **API** | `GET/PATCH /api/provider/settings/operating-hours` |
| **Enforcement** | `available-slots` reads `working_hours` to generate slot grid |
| **Status** | ✅ Enforced |

### G. Customer Visibility

| Attribute | Value |
|-----------|-------|
| **Storage** | `providers` visibility fields |
| **API** | `GET/PATCH /api/provider/customer-visibility` |
| **Enforcement** | Public search/profile queries filter by visibility |
| **Status** | ✅ Enforced |

### H. Tax Configuration

| Attribute | Value |
|-----------|-------|
| **Storage** | `provider_settings` tax fields |
| **API** | `GET/PATCH /api/provider/settings/sales/taxes`, `GET /api/provider/tax-rate` |
| **Enforcement** | Booking creation POST recomputes tax from subtotal using provider's tax rate |
| **Status** | ✅ Enforced — server-side recalculation prevents client manipulation |

---

## 4. Settings Enforcement Audit

### CRITICAL: Calendar Preferences Not Synced

| Aspect | Expected | Actual |
|--------|----------|--------|
| **Mobile** | Load from API, save to API | AsyncStorage only — `useCalendarPreferences` never calls API |
| **Web** | Load from API, save to API | `syncPreferencesToServer` exists but CalendarClient doesn't invoke it |
| **Cross-device** | Preferences follow the user | Each device has independent preferences |
| **Available-slots** | Respect workday hours | Uses location hours, ignores preferences |
| **Fix** | Wire mobile hook to GET/PATCH API; wire web calendar to call sync on save/load |

### CRITICAL: Notification Preferences Permission Mismatch

| Aspect | Expected | Actual |
|--------|----------|--------|
| **Staff access** | Either allow PATCH or hide settings from staff | GET works for staff, PATCH returns 403 |
| **Mobile UI** | Show "view only" or hide for non-owners | Shows editable form to all roles |
| **Fix** | Either add `provider_staff` to PATCH roles or check role on mobile before showing edit UI |

### HIGH: Subscription Plans Response Shape Divergence

| Aspect | Provider endpoint | Public endpoint |
|--------|-------------------|-----------------|
| **Auth** | Requires provider role | Public (no auth) |
| **Ordering** | `.order("amount")` | `.order("display_order")` |
| **Shape** | Flat plan objects | Expanded into `:free`, `:monthly`, `:yearly` options |
| **Mobile** | Calls provider endpoint | — |
| **Web** | Calls public endpoint | — |
| **Fix** | Align response shapes or ensure clients handle both correctly |

---

## 5. API Contract Audit

### Booking Creation — POST `/api/provider/bookings`

| Field | Mobile sends | Web sends | API accepts | Gap |
|-------|-------------|-----------|-------------|-----|
| `services[].service_id` | ✅ `service_id` | `serviceId` | Both (`service_id` \| `serviceId`) | ✅ Normalized |
| `services[].staff_id` | ✅ `staff_id` | `staffId` | Both | ✅ Normalized |
| `services[].duration_minutes` | ✅ `duration_minutes` | `duration` | Both (`duration` \| `duration_minutes`) | ✅ Normalized |
| `services[].currency` | ✅ Per-service | ❌ Not sent | Accepted | ⚠️ Web relies on top-level currency only |
| `services[].customization` | ❌ Not sent | ✅ Sent | Accepted | ⚠️ Mobile bookings can't have service customization |
| `deposit_required` | ❌ Not sent | ✅ `false` default | Accepted | ⚠️ Mobile never sends deposit fields |
| `deposit_percentage` | ❌ Not sent | ✅ `null` default | Accepted | Same |
| `deposit_amount` | ❌ Not sent | ✅ `null` default | Accepted | Same |
| `payment_option` | ❌ Not sent | ✅ `"full"` default | Accepted | ⚠️ Mobile always gets "full" payment |
| `service_fee_percentage` | ❌ Not sent | ✅ `0` default | Accepted | Web explicitly zeros it for provider bookings |
| `tip_amount` | Only if > 0 | Always sent (0) | Accepted | Minor — 0 vs absent is equivalent |
| `status` | From route params | `DEFAULT_APPOINTMENT_STATUS` | Accepted | ⚠️ Mobile can override status; web cannot |
| `currency` | `getTenantDefaultCurrency()` | `LAST_RESORT_CURRENCY` constant | Accepted | ⚠️ Different fallback mechanisms |

### Booking Status Transitions

| Transition | Dedicated endpoint | PATCH status | At-home verification |
|------------|-------------------|--------------|---------------------|
| Start service | `POST .../start-service` ✅ enforced | PATCH `started` ⚠️ no verification | `start-service` blocks if OTP/QR not verified |
| Complete | `POST .../complete-service` ✅ checks `in_progress` | PATCH `completed` ⚠️ less strict | `complete-service` requires started state |
| Used by front-desk | ✅ Yes | — | ✅ |
| Used by mobile detail | ❌ No | ✅ Yes | ❌ Bypassed |
| Used by web detail | ❌ No | ✅ Yes | ❌ Bypassed |

### Receipt Generation

| Platform | Method | Endpoint |
|----------|--------|----------|
| Mobile | Opens PDF URL | `GET .../receipt/pdf` |
| Web | JSON receipt + PDF link + send | `GET .../receipt` + `GET .../receipt/pdf` + `POST .../receipt/send` |

### Consent Document

| Platform | Available |
|----------|-----------|
| Mobile | ❌ Not implemented |
| Web | ✅ `POST .../consent-document` |

---

## 6. Database Schema and Integrity Audit

### CRITICAL: `Database = any`

**File:** `packages/types/src/database.ts`
```typescript
export type Database = any;
```
**Impact:** All Supabase queries across all apps (mobile, web, admin-web) have **zero compile-time type checking** on table names, column names, or return types. Any schema change (rename, drop column) will only be caught at runtime.

**Recommendation:** Run `supabase gen types typescript` and replace the `any` export with generated types.

### Provider Core Tables

| Table | Key fields | Relationships | Issues |
|-------|-----------|---------------|--------|
| `providers` | `id`, `user_id`, `business_name`, `slug`, `status`, `tenant_id`, `subscription_plan_id` | `users.id`, `tenants.id`, `subscription_plans.id` | `tenant_id` NOT NULL constraint added later; older rows may have issues |
| `provider_locations` | `provider_id`, `working_hours` JSONB, `is_primary`, `is_active` | `providers.id` | `working_hours` schema is implicit (no Zod validation on read) |
| `provider_staff` | `provider_id`, `user_id`, `role` CHECK, `permissions` JSONB, `role_id` | `providers.id`, `users.id`, `provider_roles.id` | Dual permission model: `permissions` JSONB + `role_id` → `provider_roles.permissions` |
| `provider_settings` | `provider_id`, `calendar_preferences` JSONB, appointment settings | `providers.id` | Wide JSONB columns without schema validation |
| `provider_online_booking_settings` | `provider_id`, booking rules | `providers.id` | — |
| `offering_staff` | Referenced in `validate-booking.ts` | — | ❌ **No CREATE TABLE migration found** — runtime-dependent |

### Booking Tables

| Table | Purpose | Key constraints |
|-------|---------|-----------------|
| `bookings` | Core booking record | `booking_status` enum, `provider_id` FK, `customer_id` FK |
| `booking_services` | Service lines per booking | `booking_id` FK, `offering_id` FK |
| `booking_addons` | Add-ons per service line | `booking_service_id` FK |
| `booking_products` | Products attached to booking | `booking_id` FK |
| `booking_payments` | Payment records | `booking_id` FK |
| `booking_audit_log` | Audit trail | `booking_id` FK |

### Settings Storage

| Table | Pattern | Validation |
|-------|---------|------------|
| `platform_settings` | Single active row, `settings` JSONB | Server-side only; no schema validation on read |
| `tenant_settings` | Per-tenant, `settings` JSONB, `version` | — |
| `feature_flags` | Global + tenant overrides, targeting fields | `mergeGlobalAndTenantFeatureFlags` in code |
| `provider_settings` | Per-provider JSONB columns | Zod on PATCH in some settings routes |

---

## 7. Mobile App Audit

### Dashboard (`dashboard.tsx`)
- **API:** `GET /api/provider/dashboard?location_id=&include=insights`
- **Settings:** Location-aware
- **Status:** ✅ Complete

### Calendar (`calendar.tsx`)
- **API:** Provider bookings + time blocks + availability blocks
- **Settings:** Uses `useCalendarPreferences` (local only)
- **Issue:** ❌ Preferences not synced from server; slot grid ignores preference hours
- **Fix:** Wire to `GET /api/provider/settings/calendar-preferences` on mount

### Booking Creation (`bookings/new.tsx`)
- **API:** `POST /api/provider/bookings`
- **Missing vs web:** No deposit fields, no payment_option, no service customization
- **Fix:** Add deposit/payment_option support if business requires it on mobile

### Booking Detail (`bookings/[id].tsx`)
- **API:** PATCH for status changes
- **Issue:** ❌ Does not use `start-service`/`complete-service` — bypasses at-home verification
- **Fix:** Replace PATCH `started`/`completed` with dedicated endpoints

### Notification Preferences (`settings/notification-preferences.tsx`)
- **API:** `GET/PATCH /api/provider/notification-preferences`
- **Issue:** ❌ Shows editable form to staff, but PATCH rejects non-owner roles
- **Missing categories:** `review_responses`, `unsubscribe_marketing`
- **Extra fields sent:** `quiet_hours_*`, `digest_mode` (accepted via `.passthrough()`)
- **Fix:** Check `role` before enabling save; add missing category toggles

### Profile (`more/profile.tsx`)
- **API:** `GET/PATCH /api/provider/profile`
- **Status:** ✅ Aligned with API contract

### Onboarding (`onboarding/wizard.tsx`)
- **API:** `POST /api/provider/onboarding`, `GET/POST /api/provider/onboarding/draft`
- **Validation:** Step-based via `validateStep` + `buildSubmitPayload`
- **Status:** ✅ Complete with draft persistence

### Settings Hub (`more/settings/index.tsx`)
- 50+ settings screens covering all business domains
- **Status:** ✅ Comprehensive — covers business, appointments, payments, team, services, booking visibility, clients, tips, time off, products, resources, integrations, notifications

---

## 8. Web Platform Audit

### Dashboard (`/provider/dashboard`)
- **API:** Same as mobile
- **Status:** ✅ Complete

### Calendar (`/provider/calendar`)
- **API:** Same booking/block queries
- **Settings:** `calendarPreferences.ts` has `syncPreferencesToServer` but CalendarClient doesn't call it
- **Issue:** ⚠️ Same local-only pattern as mobile
- **Fix:** Call `loadPreferencesFromServer` on mount, `syncPreferencesToServer` on save

### Bookings (`/provider/bookings`)
- **API:** Full CRUD + bulk operations
- **Web-only features:** Bulk actions (`POST /api/provider/bookings/bulk`), consent document
- **Issue:** Same PATCH-based status transition as mobile (bypasses verification)

### Front Desk (`/provider/front-desk`)
- **API:** `start-service`, `complete-service`, `waiting-room`
- **Status:** ✅ Uses dedicated endpoints correctly — **only** front-desk does this

### Settings Hub (`/provider/settings`)
- Same comprehensive settings coverage as mobile
- Categories: Appointment Activity, Clients, Services, Sales, Team, Marketing Integrations, Account
- **Status:** ✅ Complete

### Verification (`/provider/verification/embed`)
- **API:** SumSub integration for identity verification
- **Status:** ✅ Web-only feature (appropriate — requires iframe/webview)

### Reports (`/provider/reports/**`)
- **43 report endpoints** covering business, bookings, clients, payments, products, staff, revenue, occupancy
- **Status:** ✅ Comprehensive — some report paths differ from mobile but cover same domains

---

## 9. Cross-Platform Consistency Audit

### Settings Inconsistencies

| Setting | Mobile | Web | Gap |
|---------|--------|-----|-----|
| Calendar preferences | AsyncStorage only | localStorage + unused sync function | ❌ Never synced to server |
| Notification preferences | Shows to all roles | Shows to all roles | ❌ PATCH fails for staff on both |
| Subscription plans | `/api/provider/subscription/plans` | `/api/public/subscription-plans` | ⚠️ Different endpoints, different response shapes |

### Payload Inconsistencies

| Area | Mobile | Web | Impact |
|------|--------|-----|--------|
| Booking services[] | `service_id`, `duration_minutes`, `currency` per line | `serviceId`, `duration`, no per-line currency | Server normalizes; minor |
| Deposit fields | Not sent | Always sent (defaults) | Mobile bookings never have deposits |
| Payment option | Not sent | `"full"` default | Equivalent behavior |
| Service customization | Not sent | Sent if present | Mobile can't customize services |
| Status override | Possible via route params | Fixed constant | Mobile has more flexibility |

### Feature Parity Gaps

| Feature | Mobile | Web | Priority |
|---------|--------|-----|----------|
| Consent document | ❌ | ✅ | Medium |
| Bulk booking actions | ❌ | ✅ | Low |
| Waiting room | ❌ | ✅ (front desk) | Medium |
| Booking GPS tracking | ✅ `POST .../location` | ✅ `useGPSTracking` | ✅ Parity |
| Live location push | ✅ Native | ❌ Limited | Expected |
| On-demand incoming | ✅ Native push + ringtone | ✅ Overlay | ✅ Parity |

### Validation Inconsistencies

| Area | Mobile validation | Web validation | API validation |
|------|-------------------|----------------|----------------|
| Forms | `useState` + inline checks | `useState` + inline checks | Zod on some routes, ad-hoc on others |
| Phone numbers | `validatePhone` helper | Various patterns | No consistent server validation |
| Emails | `validateEmail` helper | Various patterns | Not always validated server-side |

---

## 10. End-to-End Workflow Audit

### Booking Creation Flow

| Step | Mobile | Web | API | DB | Status |
|------|--------|-----|-----|-----|--------|
| Select client | ✅ Client picker | ✅ Client dialog | Accepts `customer_id` or walk-in data | `users`, `provider_clients` | ✅ |
| Select services | ✅ Service picker | ✅ Calendar/dialog | `services[]` with flexible field names | `offerings`, `booking_services` | ✅ |
| Select time | ✅ Slot picker | ✅ Calendar click | `available-slots` checks hours + conflicts | `bookings`, `time_blocks` | ✅ |
| Set pricing | ✅ Auto-calculated | ✅ Auto-calculated | Server recalculates from rates | `bookings` totals | ✅ |
| Submit | `api.post` | `providerApi.createAppointment` | Creates booking graph + notifications | Multiple tables | ✅ |
| **Deposits** | ❌ Not supported | ✅ Sends deposit fields | Processes if present | `bookings`, `booking_payments` | ⚠️ Gap |

### At-Home Booking Lifecycle

| Step | Trigger | API | Enforcement | Issue |
|------|---------|-----|-------------|-------|
| Start journey | Tap "Start journey" | `POST .../start-journey` | Sets `current_stage` | ✅ |
| Arrive | Tap "I've arrived" | `POST .../arrive` | OTP/QR if configured | ✅ |
| Start service | Front desk: dedicated button | `POST .../start-service` | ✅ Checks OTP/QR verified | ✅ Front desk |
| Start service | Mobile/web detail: status change | `PATCH status: started` | ❌ No verification check | ❌ **Bypass** |
| Complete | Front desk: complete button | `POST .../complete-service` | ✅ Checks `in_progress` | ✅ Front desk |
| Complete | Mobile/web detail: status change | `PATCH status: completed` | ⚠️ Less strict | ⚠️ |

### Provider Onboarding Flow

| Step | Mobile | Web | API | Status |
|------|--------|-----|-----|--------|
| Start | App index gate | `/provider/get-started` | `GET /api/me/portal` | ✅ |
| Draft save | ✅ `POST /api/provider/onboarding/draft` | ✅ Same | Persists to `provider_onboarding_drafts` | ✅ |
| Submit | ✅ `POST /api/provider/onboarding` | ✅ Same | Creates `providers` row + related entities | ✅ |
| Zone suggestions | Not found in mobile | ✅ `/api/provider/onboarding/suggest-zones` | Suggests based on location | ⚠️ Mobile gap |

---

## 11. Missing / Broken / Incomplete Implementation

### Confirmed Issues

| # | Area | Issue | Impact |
|---|------|-------|--------|
| 1 | Calendar | Preferences stored in DB but consumed from local storage only | Preferences don't sync across devices/platforms |
| 2 | Bookings | PATCH status bypasses `start-service`/`complete-service` verification | At-home safety verification can be skipped |
| 3 | Notifications | PATCH rejects staff but UI doesn't prevent staff from trying | Staff see 403 error on save |
| 4 | Types | `Database = any` in shared types | Zero compile-time DB type safety |
| 5 | Schema | `offering_staff` table queried but no CREATE TABLE migration found | Runtime-dependent; fragile |
| 6 | Mobile | No deposit/payment_option fields in booking creation | Mobile bookings can't collect deposits |
| 7 | Mobile | No consent document support | Legal/compliance gap for regulated services |
| 8 | Mobile | No service customization field in booking payload | Feature gap vs web |
| 9 | Mobile | Missing `review_responses` notification category | Can't toggle review response notifications |
| 10 | Web | Calendar doesn't call `syncPreferencesToServer` despite function existing | Preferences reset on new browser/device |

### Likely Risks

| # | Area | Risk |
|---|------|------|
| 1 | Currency | Mobile uses `getTenantDefaultCurrency()`, web uses `LAST_RESORT_CURRENCY` — different fallback paths could produce different currencies on edge cases |
| 2 | Subscription | Mobile and web call different endpoints for plans — ordering and shape differ |
| 3 | Quiet hours | Mobile sends `quiet_hours_*` accepted via `.passthrough()` — these fields have no server-side enforcement |
| 4 | Reports | Mobile and web use different report endpoint paths for some domains — data could differ |

---

## 12. Prioritized Fix Plan

### Critical

| # | Title | Area | Root cause | Fix | Complexity |
|---|-------|------|-----------|-----|------------|
| 1 | **Booking status bypass — at-home verification** | Mobile + Web booking detail | PATCH `status` doesn't enforce `start-service` preconditions | Replace PATCH `status: started/completed` calls with `POST .../start-service` and `POST .../complete-service` in both booking detail screens | Medium |
| 2 | **Generate real Database types** | All apps | `Database = any` in packages/types | Run `supabase gen types typescript` and export real types | Low |
| 3 | **Calendar preferences sync** | Mobile + Web | Local-only storage | Mobile: add API GET on mount + PATCH on save in `useCalendarPreferences`; Web: call `loadPreferencesFromServer` in CalendarClient mount | Medium |
| 4 | **Notification preferences staff permission** | Mobile + API | PATCH restricts to owner but UI shows to all | Either add `provider_staff` to PATCH roles (safest) or add role check in mobile UI to disable save for non-owners | Low |

### High

| # | Title | Area | Fix | Complexity |
|---|-------|------|-----|------------|
| 5 | **Add offering_staff migration** | DB | Create explicit `CREATE TABLE IF NOT EXISTS offering_staff` migration to ensure schema stability | Low |
| 6 | **Mobile deposit support** | Mobile booking creation | Add deposit_required/percentage/amount fields to new booking form when provider has deposits enabled | Medium |
| 7 | **Align subscription plan endpoints** | API | Either merge into one endpoint or ensure both return compatible shapes; document which clients use which | Low |
| 8 | **Add consent document to mobile** | Mobile booking detail | Add POST to `.../consent-document` with document capture UI | Medium |

### Medium

| # | Title | Area | Fix | Complexity |
|---|-------|------|-----|------------|
| 9 | **Add missing notification categories to mobile** | Mobile | Add `review_responses` and `unsubscribe_marketing` toggles to notification preferences screen | Low |
| 10 | **Service customization on mobile** | Mobile booking creation | Add customization text field per service line | Low |
| 11 | **Zone suggestions in mobile onboarding** | Mobile onboarding | Add call to `/api/provider/onboarding/suggest-zones` after location step | Low |
| 12 | **Standardize currency fallback** | Mobile + Web | Use same `getTenantDefaultCurrency()` logic on both platforms | Low |

### Low

| # | Title | Area | Fix | Complexity |
|---|-------|------|-----|------------|
| 13 | **Quiet hours server enforcement** | API | Add server-side quiet hours check in notification dispatch | Medium |
| 14 | **Bulk booking actions on mobile** | Mobile | Add bulk selection + action UI for bookings list | High |
| 15 | **Waiting room on mobile** | Mobile | Add waiting room screen with `/api/provider/waiting-room` integration | Medium |
| 16 | **Shared validation schemas** | All | Create shared Zod schemas in `@beautonomi/types` for booking, profile, settings payloads | High |

---

## 13. Final Verdict

### Are all settings properly respected across provider mobile and web?
**No.** Calendar preferences are the most significant gap — stored in DB but never read by either platform. Notification preferences have a permission model mismatch. Most other settings (operating hours, booking rules, payment, tax, visibility) are properly enforced.

### Are APIs complete and contract-correct?
**Mostly.** The server does an excellent job normalizing divergent field names (`serviceId` vs `service_id`). The main gap is in optional fields (deposits, customization, payment_option) that web sends but mobile doesn't. Subscription plan endpoints return incompatible shapes.

### Is the data model/schema fully adhered to?
**No.** `Database = any` means no compile-time verification. `offering_staff` is queried but has no visible migration. JSONB settings columns lack schema validation on read.

### Are UI implementations complete and correct?
**Largely yes.** Both platforms are feature-rich with 211 mobile screens and 163 web pages. The main gaps are mobile-missing features (consent document, deposit support, bulk actions, waiting room) that exist on web.

### What blocks production-grade confidence?
1. At-home booking verification bypass via PATCH
2. `Database = any` eliminating type safety
3. Calendar preferences not syncing across devices
4. Staff seeing 403 on notification preference saves

### What should be fixed first?
1. Fix booking status transition to use dedicated endpoints (safety)
2. Generate real Supabase types (developer confidence)
3. Wire calendar preference sync (user experience)
4. Fix notification permission mismatch (UX error prevention)

---

## Summary Tables

### Settings Not Fully Respected

| Setting | Affected Platform | Expected Behavior | Actual Behavior | Gap Type | Required Fix | Priority |
|---------|-------------------|-------------------|-----------------|----------|-------------|----------|
| Calendar preferences | Both | Synced to server, loaded from server | Local storage only (AsyncStorage / localStorage) | Not consumed | Wire API GET/PATCH in hooks | Critical |
| Notification prefs (staff) | Mobile | Staff can view but not edit, or can edit | Staff sees form, save returns 403 | Permission mismatch | Add staff to PATCH roles or disable save UI | Critical |
| Notification prefs categories | Mobile | All categories shown | `review_responses`, `unsubscribe_marketing` missing | Missing UI | Add missing toggles | Medium |
| Quiet hours | Both | Server enforces quiet hours | Stored but not enforced in notification dispatch | Not enforced | Add server-side check | Low |

### API / Payload / Schema Mismatches

| Endpoint / Entity | Mobile Payload | Web Payload | Expected Contract | DB Schema | Mismatch | Required Fix | Priority |
|--------------------|---------------|-------------|-------------------|-----------|----------|-------------|----------|
| POST bookings `services[]` | `service_id`, `duration_minutes`, `currency` per line | `serviceId`, `duration`, no per-line `currency` | Both accepted | `booking_services` | Field naming; server normalizes | Document canonical fields | Low |
| POST bookings deposits | Not sent | `deposit_required`, `deposit_percentage`, `deposit_amount` | Optional | `bookings` columns | Mobile can't create deposit bookings | Add to mobile form | High |
| POST bookings `payment_option` | Not sent | `"full"` default | Optional | `bookings.payment_option` | Functionally equivalent | None needed | Low |
| POST bookings `customization` | Not sent | Sent per service | Optional | `booking_services.customization` | Mobile can't customize | Add to mobile | Medium |
| GET subscription plans | `/api/provider/subscription/plans` → flat | `/api/public/subscription-plans` → expanded options | No shared contract | `subscription_plans` | Different shapes | Align endpoints | High |
| PATCH notif prefs | Includes `quiet_hours_*`, `digest_mode` | Standard categories | `.passthrough()` accepts extra | JSONB | Extra fields stored but not enforced | Validate or enforce | Medium |
| `offering_staff` | Queried in `validate-booking.ts` | Referenced in booking validation | Expected table | No CREATE TABLE migration found | Missing migration | Add migration | High |

### Incomplete UI / Feature Areas

| Platform | Module / Screen | Missing or Broken Capability | API Impact | Data / Schema Impact | Required Fix | Priority |
|----------|----------------|------------------------------|------------|---------------------|-------------|----------|
| Mobile | Booking detail | Uses PATCH instead of `start-service`/`complete-service` | Bypasses at-home verification | Status set without safety checks | Use dedicated endpoints | Critical |
| Web | Booking detail | Same PATCH pattern | Same bypass | Same | Same fix | Critical |
| Mobile | Booking creation | No deposit/payment_option fields | Can't create deposit bookings | `deposit_*` columns unused from mobile | Add deposit UI | High |
| Mobile | Booking creation | No service customization | Can't add per-service notes | `booking_services.customization` unused | Add customization field | Medium |
| Mobile | Booking detail | No consent document | Legal gap | `consent_documents` not created from mobile | Add consent document UI | Medium |
| Mobile | Notification prefs | Missing `review_responses` category | Incomplete pref control | Stored as default server-side | Add toggle | Medium |
| Mobile | Onboarding | No zone suggestions | Manual zone selection only | — | Add suggest-zones call | Medium |
| Mobile | Bookings list | No bulk actions | Single-item only | — | Add bulk UI | Low |
| Mobile | — | No waiting room screen | Missing front-desk feature | — | Add waiting room | Low |
| Both | Calendar | Preferences not synced to server | Local-only; lost on device change | `provider_settings.calendar_preferences` unused | Wire sync | Critical |
