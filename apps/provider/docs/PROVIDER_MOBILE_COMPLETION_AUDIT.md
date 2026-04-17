# Provider mobile app — completion audit

**Scope:** `apps/provider` (Expo / React Native).  
**Method:** Static review of routes, UI hubs, and every `/api/...` reference in app source (excluding `node_modules`). Cross-check against provider web (`apps/web/src/app/provider/**`) for parity context.  
**Date:** 2026-04-13.

**Related docs:** [API_ALIGNMENT_AUDIT.md](./API_ALIGNMENT_AUDIT.md) (contract-level alignment with portal APIs), [MORE_MENU_ALIGNMENT.md](./MORE_MENU_ALIGNMENT.md), [BOOKING_FLOW_ALIGNMENT.md](./BOOKING_FLOW_ALIGNMENT.md).

---

## Executive summary

| Area | Completion (qualitative) | Notes |
|------|---------------------------|--------|
| Auth & routing | **High** | Portal role check (`/api/me/portal`), provider profile gate, onboarding when `setup-status` requires it. |
| Core operations (bookings, calendar, clients, sales) | **High** | Booking detail is one of the largest surfaces (`bookings/[id].tsx`) and exercises many lifecycle and payment APIs. |
| Catalogue & e‑commerce | **High** | Services, products, packages, orders, returns, inventory, walk-in sales, shipping config. |
| Team & payroll | **High** | Staff, shifts, schedule, time clock, pay runs, commissions, permissions, days off, team totals. |
| Finance & billing | **High** | Finance hub, VAT reports, invoices, payouts, subscription/billing settings, Yoco hooks. |
| Settings | **Very high** | Large nested settings tree (business, locations, hours, policies, integrations, Twilio, calendar, ads, etc.). |
| Reports & analytics | **High** | Catalog entries use native stacks or **`reports/detail/[reportId]`**, which calls the same **`/api/provider/reports/*`** routes as the portal (`reportDetailRegistry.ts`). |
| Explore / social | **Medium–high** | Native Explore posts use **`/api/explore/*`** (not under `/api/provider/`). |
| Web parity | **Not 1:1** | Web provider area has many `page.tsx` routes; mobile consolidates flows; reports use the **same APIs** as web with native rendering. |

---

## Architecture (how APIs are called)

- **Base URL:** `EXPO_PUBLIC_APP_URL` → `apps/web` origin; requests use **Bearer token** from Supabase (`@beautonomi/api` via `src/lib/api-client.ts`). No cookie session.
- **Path helpers:** `src/lib/provider-api-paths.ts` (e.g. `apiProviderAiFeaturePath`) keeps special-case URLs aligned with web route files; extend when adding new cross-screen endpoints.
- **Hooks:** `useApi` / `useApiPost` / `useApiMutation` (`src/hooks/useApi.ts`) for GET and mutations; some screens call `api.get` / `api.patch` / `api.post` / `api.fetch` directly.
- **Response convention:** Server uses `successResponse` → mobile typically reads `data` (see API alignment doc).
- **Caching:** In-memory response cache keyed by user + path (`src/lib/api-response-cache.ts`); comments note scoping for `/api/me/*`.

---

## Navigation & major UI surfaces

### Tab bar (`app/(app)/(tabs)/_layout.tsx`)

Visible tabs: **Dashboard**, **Calendar**, **Clients**, **Chats**, **Sales**, **More**.  
Hidden from tab bar (`href: null`): **Settings** (`settings.tsx`) — still a registered route, reachable via navigation.

### “More” hub (`more/index.tsx`)

Structured sections: **Operations**, **E‑Commerce & Products**, **Business**, **Engagement**, **Settings**, plus quick actions and profile completion (`GET /api/provider/profile-completion`).

### Reports hub (`more/reports/reportCatalog.tsx`)

Models **native** (stack screens under `more/reports/*.tsx`), **detail** (dynamic `more/reports/detail/[reportId].tsx` → `GET /api/provider/reports/...` per `reportDetailRegistry.ts`), and **route** (e.g. analytics/activity).

### Portal escape hatch (`more/portal.tsx`)

Optional: any path under `/provider/...` can still be opened in the device browser for edge cases; reporting no longer depends on it.

### Other UX notes

- **In-app browser** route (`more/in-app-browser.tsx`) opens arbitrary URLs externally when needed.

---

## API surface used by the mobile app

Below is a **route-pattern** inventory (static strings and obvious templates). Dynamic segments are written as `[id]` or described in parentheses. For exhaustive regeneration, search for `` `/api/` `` and `"/api/` in `apps/provider` (TypeScript only).

### 1. `/api/provider/*` (primary business API)

**Identity & profile:** `profile`, `profile-completion`, `subscription`, `setup-status`, `team-access`, `search`.

**Dashboard & activity:** `dashboard` (often `?location_id=`, `include=insights`), `activity`, `reports/weekly-revenue`, `reports/top-services`.

**Bookings:**  
`bookings` (list/create; query: dates, status, location, limit, sort),  
`bookings/[id]` (detail, patch),  
`bookings/available-slots`, `bookings/check-availability`,  
`bookings/[id]/mark-paid`, `.../start-service`, `.../complete-service`, `.../refund`, `.../request-payment`, `.../send-payment-link`,  
`.../location`, `.../additional-charges`, `.../additional-charges/[chargeId]/mark-paid`,  
`.../resources`, `.../consent-document`, `.../audit-log`,  
`.../start-journey`, `.../arrive`, `.../verify-arrival`, `.../resend-arrival-otp`, `.../verify-qr`,  
`bookings/[id]/receipt/pdf` (URL construction for PDF).

**Sales & POS:** `sales` (list, patch sale line), `product-sales`, `walk-in` flows, `coupons/validate`, `ratings` (GET by booking, POST create).

**Catalogue:**  
`services` (list with variants, reorder, toggle active), `services/[id]`, `services/[id]/addons`, `services/[id]/variants`,  
`categories`, `categories/[id]`,  
`products`, `products/[id]`, `brands`, `suppliers`, `product-categories`, `reference-data?type=...`,  
`packages`, `packages/[id]`, `addons`,  
`catalogue` hubs combine these.

**Staff & team:**  
`staff`, `staff/[id]`, `staff/[id]/shifts`, `staff/[id]/shifts/[shiftId]`,  
`staff/[id]/days-off`, `staff/[id]/days-off/[dayOffId]`,  
`staff/[id]/notifications`, `staff/[id]/permissions`,  
`staff/[id]/totals`, `staff/totals`,  
`team` (often `?location_id=`).

**Locations & zones:** `locations`, `locations?include_inactive=true`, `zone-selections`, `zone-selections/[id]`, `service-zones/analytics`, onboarding `onboarding/suggest-zones`.

**Clients & conversations:** `clients`, `clients/serviced`, `clients/conversations`, `clients/create`, `clients?search=` / `?customer_id=`, `conversations/create`, `conversations`, `conversations/[id]`, `conversations/[id]/messages`, `conversations/[id]/mark-read`, `custom-offers/[id]/retract`, `customers/[id]/profile`, `clients/[id]` (client detail stack).

**Custom requests:** `custom-requests`, `custom-requests/[id]`, `custom-requests/[id]/offers`.

**Group & recurring:** `group-bookings`, `group-bookings/[id]`, participants sub-routes, `recurring-appointments`, `recurring-appointments/[id]`.

**Waitlist & waiting room:** `waitlist`, `waitlist/[id]`, `.../notify`, `.../quick-book`, `waiting-room`, `waiting-room/[bookingId]`.

**Resources & forms:** `resources`, `resources/[id]`, `resource-groups`, `resource-groups/[id]`, `forms`, `forms/[id]`, `forms/[id]/fields`, `forms/[id]/fields/[fieldId]`.

**Finance:** `finance` (`?range=`, `location_id`), `finance/vat-reports`, `finance/vat-reports/[id]/mark-remitted`, `billing-history`, `invoices`, `invoices/[id]`, `invoices/[id]/send`, `payouts`, `pay-runs`, `pay-runs/[id]/approve`, `pay-runs/[id]/mark-paid`, `pay-runs/my-earnings`, `subscription/booking-eligibility`.

**Product commerce:** `product-orders`, `product-orders/[id]`, `returns`, `returns/[id]`, `shipping-config`.

**Notifications:** `notifications`, `notifications/mark-all-read`, `notifications/[id]`, `notifications/[id]/read`, `notification-preferences`, `notification-preferences/test`.

**Marketing & growth:** `campaigns`, `campaigns/[id]/send`, `promotions`, `promotions/[id]`, `ads/campaigns`, `ads/performance`, `ads/packs`, `automations`, `automations/[id]`, `membership-plans`, `membership-plans/[id]`, `referral-sources`, `gamification`.

**Reviews & engagement:** `reviews`, `engagement-hub` aggregates via reviews list.

**On-demand:** `on-demand/requests`, `on-demand/requests/[id]`, `accept` / `decline` actions.

**Routes (at-home):** `routes?date=`, `routes/optimize`.

**Time & scheduling:** `time-blocks`, `blocked-time-types`, `closed-periods`, `time-clock`, `time-clock/[id]`, `staff/[id]/time-clock/clock-in` / `clock-out`.

**Settings (non-exhaustive but broad):**  
`settings/business`, `settings/payments`, `settings/billing`, `settings/waitlist`, `settings/calendar-preferences`,  
`settings/online-booking`, `settings/appointments`, `settings/group-bookings`,  
`settings/sales/tips`, `settings/sales/taxes`, `settings/sales/receipt`, `settings/sales/gift-cards`,  
`booking-link`, `customer-visibility`, `cancellation-policies`, `cancellation-reasons`,  
`payout-accounts`, `payout-accounts/banks`, `payout-accounts/verify`,  
`team/roles`, `team/roles/[id]`, `team/commissions`,  
`calendar/syncs`, `calendar/auth-url`, `calendar/sync`,  
`twilio-integration` (+ `balance`, `stats`, `templates`, `test`, template `[id]`),  
`email-integration`, `yoco/integration` and related (see `useYoco.ts`), `yoco-devices` screen,  
`verification/status`, `verification/sumsub/token` (provider KYC helpers).

**Reports (native API consumers):** various `reports/*` paths with `from`/`to`/`period`/`location_id` — e.g. `reports/services`, `reports/staff`, `reports/bookings`, `reports/payments`, `reports/products`, `reports/clients`, `reports/gift-cards`, `reports/packages`, `reports/business/overview`, `reports/revenue` (screen-specific), etc.

**Misc:** `note-templates`, `product-sales`, `express-booking`, `resources` gallery-adjacent, `gallery` screen APIs, `upload` via shared upload endpoint (see below).

### 2. `/api/me/*` (user account & platform)

Used for cross-app concerns:  
`portal`, `role`, `profile`, `avatar`, `password`,  
`provider` (settings hub),  
`account-status`, `reactivate-account`, `delete-account`,  
`support-tickets`, `support-tickets/[id]`, `support-tickets/[id]/messages`,  
`devices` (push), `analytics/consent`, `analytics/identify`,  
`messages/upload`,  
`safety/panic`,  
`retention/sync-on-login`,  
`verification` (identity POST for some flows),  
`deactivate`.

### 3. `/api/public/*`

`config-bundle`, `third-party-config`, `categories/global`, `pricing/plans`, `tenant-context`, `app-version`, `maintenance`, `maintenance-notify`, `on-demand/ringtone-url`.

### 4. `/api/upload` and uploads

- **General upload:** `POST /api/upload` (e.g. product images, onboarding assets) via `api.fetch`.
- **Explore-specific:** `POST /api/explore/upload` in Explore posts.

### 5. `/api/mapbox/*`

- `POST /api/mapbox/geocode` — address autocomplete (`AddressAutocomplete.tsx`).

### 6. `/api/explore/*` (Explore / social — provider content)

- `GET /api/explore/posts/mine`  
- `GET/POST/PATCH/DELETE /api/explore/posts/...`, `.../comments`  
These are **not** namespaced under `/api/provider/` but are used by the provider app for Explore.

---

## Payload & typing patterns

- **GET:** Mostly untyped or interface-per-screen (e.g. `DashboardMetrics`, `BookingDetail`, `FinanceResponse`); `useApi<T>` supplies generics.
- **PATCH/POST bodies:** Built as plain objects next to the call; key flows (booking create, staff update, settings) mirror portal fields — see [API_ALIGNMENT_AUDIT.md](./API_ALIGNMENT_AUDIT.md) for tables.
- **File upload:** `multipart/form-data` via `api.fetch` to `/api/upload` or `/api/explore/upload`; responses provide `url` / `path` for persistence on entity PATCH.
- **Errors:** Structured `error.code` (e.g. subscription) surfaced via `useApi`’s `errorCode` where used.

---

## Reports, sales tab, AI, and copy (current state)

1. **Reports:** Former “portal-only” catalog entries now use `target: "detail"` in `reportCatalog.tsx` and open **`more/reports/detail/[reportId].tsx`**, which calls the **same** GET handlers as the web portal under `/api/provider/reports/...` (see `reportDetailRegistry.ts`). Data is rendered natively via `ReportPayloadView`. Dedicated report screens (bookings, services, etc.) are unchanged.

2. **Sales tab:** The **Sales** tab is **visible** in the main tab bar (`(tabs)/_layout.tsx` — `href: null` removed from `sales`).

3. **AI:** **`more/ai-studio.tsx`** calls **`POST /api/provider/ai/[feature_key]`** for `ai.provider.profile_completion` and `ai.provider.content_studio` (same feature keys as `apps/web/src/app/api/provider/ai/[feature_key]/route.ts`). Entry: **Settings & account → Marketing → AI studio**.

4. **Copy:** Messaging custom-request banner and catalogue empty state no longer tell users to use the browser; they deep-link to **Custom requests** and **Catalogue** in-app.

5. **Backend vs client:** The web repo still has more **pages** than the mobile app has **screens**; not every admin URL has a 1:1 route. API handlers may still exist for web-only or future clients.

---

## Completion status (summary verdict)

- **Operations, bookings, payments, catalogue, team, finance, settings, reports, and AI studio:** The provider mobile app uses the **shared Next.js API** with Bearer auth; report drill-downs use the **same report APIs** as the portal, rendered in-app.
- **API coverage:** All network access is **Bearer-authenticated** to the web app; inventory above reflects **every major prefix** used in source, including **`/api/explore/*`** for Explore.

---

## Maintenance

To refresh the **exact** path list after changes:

1. Search the codebase for `"/api/` and `` `/api/` `` under `apps/provider` (exclude `node_modules`).
2. Reconcile new routes with `apps/web/src/app/api/**/route.ts`.
3. Update [API_ALIGNMENT_AUDIT.md](./API_ALIGNMENT_AUDIT.md) when contracts change.
