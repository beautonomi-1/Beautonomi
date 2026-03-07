# Provider mobile app – full audit

**Scope:** Every screen and feature in `apps/provider`. Structure mapping, API correctness, and functionality checks.

**Date:** 2025-03-07

---

## 1. App structure summary

### 1.1 Route hierarchy

| Layer | Path | Description |
|-------|------|-------------|
| Root | `app/_layout.tsx` | Stack: index, (auth), (app). Providers: SafeArea, Theme, Auth, Analytics, ConfigBundle, Push, ErrorBoundary, OfflineBar, ForceUpdateGate. |
| Entry | `app/index.tsx` | Portal check (`GET /api/me/portal`), profile check (`GET /api/provider/profile`). Redirect: no session → login; wrong portal → WrongAppScreen; no profile → onboarding; ok → dashboard. |
| Auth | `(auth)/` | Stack: login, signup, forgot-password, terms, privacy. Redirects to `/` if session exists. |
| Auth callback | `auth/callback.tsx` | OAuth/web: extracts tokens from URL, sets session. |
| App | `(app)/` | Stack: (tabs), search, notifications, onboarding, chat/[id], on-demand/incoming/[id]. Guards: session, RoleGate, ProviderProvider, NotificationsCountProvider, AccountStatusGuard, EmailVerificationBanner. |
| Tabs | `(tabs)/` | Tabs: **dashboard**, **calendar**, **clients**, **chats**, **sales**, **more**. **settings** (href: null, hidden). AppHeader above tabs. |
| More | `(tabs)/more/` | Single Stack; all more routes and nested stacks (bookings, catalogue, clients, messaging, support-tickets, custom-requests, locations, reports, settings, staff-permissions). |

### 1.2 Screens by category

**Auth (5 + callback)**  
- `(auth)/login`, `signup`, `forgot-password`, `terms`, `privacy`  
- `auth/callback` (web OAuth)

**Main tabs (6 + 1 hidden)**  
- Dashboard, Calendar, Clients, Chats, Sales, More  
- Settings (hidden tab)

**App stack (sibling to tabs)**  
- `search`, `notifications`, `onboarding`, `chat/[id]`, `on-demand/incoming/[id]`

**More – list/detail**  
- Bookings (index, [id], new)  
- Catalogue (index, [id])  
- Clients (index, [id])  
- Messaging (index, [id])  
- Support tickets (index, [id])  
- Custom requests (index, [id])  
- Locations (list, add, [id])  
- Reports (index + revenue, bookings, clients, staff, payments, products, services, gift-cards, packages, business)  
- Settings (index + 50+ sub-screens), staff-permissions (index, [id])

**More – forms / flows**  
- service-form, product-form, express-booking, walk-in-sale, bookings/new  
- days-off, time-blocks, staff-schedule, resources  
- Recurring appointments, group-bookings, waitlist, etc.

**More – hubs / info**  
- index, schedule-hub, finance-hub, products-hub, team-hub, marketing-hub, rewards-hub, settings-hub, settings-account-hub  
- profile, contact-support, portal, in-app-browser, [slug] (catch-all “manage on web”)

---

## 2. API usage map

All provider API calls go through `api` from `@/lib/api-client` (baseUrl = APP_URL or localhost:3000 in dev). Auth: Bearer token; 401 → refresh then retry; second 401 → sign out.

### 2.1 Auth & global

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/me/portal` | index | Portal check (provider vs customer vs admin) |
| `GET /api/provider/profile` | index, ProviderContext, profile, settings-business-description, gallery | Profile load / redirect / patch |
| `GET /api/me/role` | RoleGate, ProviderContext | Role gate |
| `POST /api/me/devices` | PushNotificationsProvider | Register device (OneSignal) |
| `PUT /api/me/password` | settings-change-password | Change password |
| `POST /api/me/deactivate` | settings-deactivate-account | Deactivate account |
| `POST /api/me/support-tickets` | contact-support | Create support ticket |
| `POST /api/me/safety/panic` | SafetyPanicButton | Safety panic |

### 2.2 Dashboard & calendar

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/provider/dashboard` | dashboard, sales | Metrics |
| `GET /api/provider/bookings` | dashboard, bookings/index, calendar | List bookings (date range, filters) |
| `GET /api/provider/reports/weekly-revenue` | dashboard | Weekly revenue |
| `GET /api/provider/reports/top-services` | dashboard | Top services |
| `GET /api/provider/activity` | dashboard | Activity feed |
| `GET /api/provider/bookings/[id]` | bookings/[id] | Booking detail |
| `POST /api/provider/bookings/[id]/location` | bookings/[id] | ETA/location (at-home, en route) |
| Various booking actions | bookings/[id] | Start journey, complete, cancel, etc. |

### 2.3 Clients & messaging

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/provider/clients` | clients tab, team-list, sales | List clients |
| `GET /api/provider/clients/serviced` | clients tab | Serviced clients |
| `GET /api/provider/clients/conversations` | clients tab | Clients with conversations |
| `GET /api/provider/clients/[id]` | clients/[id] | Client detail |
| `POST /api/provider/clients/create` | clients tab | Create client |
| `POST /api/provider/conversations/create` | clients tab | Start conversation |
| `GET /api/provider/conversations` | messaging/index | List conversations |
| `GET /api/provider/conversations/[id]` | messaging/[id] | Conversation + messages |
| `POST /api/provider/conversations/[id]/messages` | messaging/[id] | Send message |
| `POST /api/provider/conversations/[id]/mark-read` | messaging/[id] | Mark read |
| `POST /api/provider/custom-offers/[id]/retract` | messaging/[id] | Retract offer |
| `DELETE /api/provider/conversations/[id]` | messaging/[id] | Delete conversation |

### 2.4 Custom requests & waitlist

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/provider/custom-requests` | custom-requests/index | List requests |
| `GET /api/provider/custom-requests/[id]` | custom-requests/[id] | Request detail |
| `POST /api/provider/custom-requests/[id]/offers` | custom-requests/[id] | Send offer |
| `GET /api/provider/team` | custom-requests/[id] | Team list for offer (staff) |
| `GET /api/provider/locations` | custom-requests/[id], many others | Locations |
| `GET /api/provider/waitlist` | waitlist | Waitlist entries |
| `GET /api/provider/waiting-room` | waiting-room | Waiting room |

### 2.5 Services, catalogue, products

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/provider/services` | catalogue, sales, staff-schedule, group-appointments, catalogue-offerings-hub, etc. | List services |
| `GET /api/provider/services/[id]` | catalogue/[id], service-form | Service detail |
| `GET /api/provider/categories` | catalogue/index, service-form | Categories |
| `POST/PATCH/DELETE /api/provider/categories`, services | catalogue, service-form | CRUD |
| `GET /api/provider/products` | products, sales, product-form, packages | List products |
| `GET /api/provider/products/[id]` | product-form | Product detail |
| `POST/PATCH/DELETE /api/provider/products` | products, product-form | CRUD |
| `GET /api/provider/brands`, `product-categories`, `suppliers` | product-form | Lookups |
| `GET /api/provider/reference-data` | service-form, product-form | service_type, availability, tax_rate, product_unit |

### 2.6 Locations & staff

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/provider/locations` | locations, dashboard, sales, staff-schedule, group-appointments, etc. | List locations |
| `GET/POST/PATCH/DELETE /api/provider/locations` | locations (list), locations/add, locations/[id] | CRUD locations |
| `GET /api/provider/staff` | team, team-list, staff-schedule, time-clock, days-off, service-form, sales | List staff |
| `GET/PATCH /api/provider/staff/[id]/shifts` | staff-schedule | Shifts |
| `GET/POST /api/provider/staff/[id]/days-off` | days-off | Days off |
| `GET/POST /api/provider/staff/[id]/time-clock/*` | time-clock | Clock in/out |
| `GET/PATCH /api/provider/staff/[id]/permissions` | staff-permissions/[id] | Permissions |

### 2.7 Settings (representative)

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET/PATCH /api/provider/settings/business` | settings/business | Business details |
| `GET /api/provider/profile` + PATCH | settings-business-description, gallery | Description, logo, avatar |
| `GET/PATCH /api/provider/setup-status` | onboarding, settings/setup-status | Setup status |
| `GET/PATCH /api/provider/notification-preferences` | settings/notification-preferences, settings-notification-preferences | Notification prefs |
| `GET/PATCH /api/provider/booking-link` | express-booking, settings/booking-link | Booking link |
| `GET/PATCH /api/provider/calendar/syncs`, auth-url, sync | settings/calendar-integration | Calendar sync |
| `GET/PATCH /api/provider/settings/calendar-preferences` | settings/calendar-preferences | Calendar prefs |
| `GET/PATCH /api/provider/cancellation-policies` | settings/cancellation-policies | Policies |
| `GET/PATCH /api/provider/travel-fees` | settings/travel-fees | Travel fees |
| `GET/PATCH /api/provider/settings/payments` | settings/payments, sales | Payment settings |
| `GET/PATCH /api/provider/payout-accounts` | settings/payout-accounts | Payout accounts |
| `GET/PATCH /api/provider/note-templates` | settings/note-templates | Note templates |
| `GET/PATCH /api/provider/time-off-types` | settings/time-off-types | Time-off types |
| `GET/PATCH /api/provider/settings/group-bookings` | settings/group-appointments | Group booking settings |
| `GET/PATCH /api/provider/tips/distribution` | settings/tip-distribution | Tip distribution |
| `GET/PATCH /api/provider/settings/sales/*` | gift-cards-settings, upselling, receipt-template, tax-configuration | Sales settings |
| `GET/PATCH /api/provider/email-integration`, test, send-test | settings/email-integration | Email integration |
| `GET/PATCH /api/provider/twilio-integration`, templates, balance, stats, test | settings/twilio-integration | Twilio |
| `GET/PATCH /api/provider/referral-sources` | settings/referral-sources | Referral sources |
| `GET/PATCH /api/provider/resource-groups` | settings/resource-groups | Resource groups |
| `GET/PUT /api/provider/shipping-config` | settings/shipping-config | Shipping |
| `GET /api/provider/forms` | settings/forms, resources-forms-hub | Forms list |
| `GET/PATCH /api/provider/settings/appointments` | settings-appointment-defaults | Appointment defaults |

### 2.8 Reports, finance, sales

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/provider/reports/*` | reports, reports/*, dashboard, inventory | Various reports |
| `GET /api/provider/finance` | finance | Finance summary |
| `GET/POST /api/provider/sales` | sales, sales-history | Sales, create sale |
| `GET /api/provider/invoices` | invoices, settings/billing | Invoices |
| `PATCH /api/provider/invoices/[id]`, send | invoices | Update/send invoice |
| `GET /api/provider/pay-runs`, POST approve, mark-paid, create | payroll | Pay runs |

### 2.9 Other

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET/POST /api/provider/notifications`, mark-all-read | NotificationsDropdown, NotificationsCountContext | Notifications |
| `GET /api/provider/reviews`, POST respond | reviews | Reviews |
| `GET/POST/PATCH/DELETE /api/provider/suppliers` | suppliers | Suppliers |
| `GET /api/provider/waitlist` | waitlist | Waitlist |
| `GET/POST/PATCH/DELETE /api/provider/promotions` | promotions | Promotions |
| `GET /api/provider/packages` + CRUD | packages | Packages |
| `GET/PATCH /api/provider/gallery`, profile (avatar/thumbnail) | gallery | Gallery |
| `GET/PATCH /api/provider/returns` | product-returns | Returns |
| `GET /api/provider/time-blocks` + POST/DELETE | time-blocks | Time blocks |
| `GET /api/provider/analytics` | analytics | Analytics |
| `GET /api/provider/campaigns` | marketing | Campaigns |
| `GET /api/provider/subscription` | subscription | Subscription |
| `GET /api/provider/gamification` + recalculate | gamification | Gamification |
| `GET /api/provider/booking-link` + express links | express-booking | Express booking |
| `GET /api/upload` | product-form, catalogue/[id] | Image upload (uses APP_URL for fetch) |
| `GET /api/mapbox/geocode` | AddressAutocomplete (locations add/edit) | Address suggestions |

---

## 3. Data correctness & response shape

### 3.1 Consistent patterns

- **useApi** returns `{ data, loading, error, refresh }`. The `api` client normalizes responses to `{ data: json?.data ?? json, error: null }` or `{ data: null, error }`. So:
  - Backend returning `{ data: X }` → `data === X`.
  - Backend returning raw array/object → `data` is that value.
- Many list screens handle both shapes, e.g. `Array.isArray(data) ? data : (data as { data?: T })?.data ?? []`.

### 3.2 Screens that unwrap `data` correctly

- **Bookings index:** `data` as array; uses `Array.isArray(data) ? data : []`.
- **Custom requests index:** Handles `data` or `(data as { data?: T })?.data`.
- **Custom requests [id]:** Request detail; locations as array; team as array (staffList).
- **Locations:** `useApi<LocationItem[]>("/api/provider/locations")`; expects array.
- **Catalogue index:** Services/categories; uses mutations and array checks.
- **Products:** Uses `ProductsResponse`; handles list and modal create/update/delete.

### 3.3 Potential response-shape issues

- **Staff vs team:** Custom-requests [id] uses `GET /api/provider/team` for staff list. Web has `apps/web/src/app/api/provider/team/route.ts`. Ensure response is array of `{ id, name }` (or unwrap if backend returns `{ data: [] }`). App does `Array.isArray(teamData) ? teamData : []` so if backend returns `{ data: staffList }`, `teamData` would be that object and `staffList` would be empty. **Recommendation:** Confirm backend team route returns array at top level or document that it returns `{ data: [] }` and unwrap in app.
- **Reference data:** service-form and product-form use `useApi` for reference-data; ensure backend returns the shape expected (e.g. `{ service_type: [], availability: [], tax_rate: [] }` or similar).

---

## 4. Functionality by area

### 4.1 Entry & auth

- **index:** Portal + profile check; timeouts and retry; redirects correct. **OK.**
- **Login/signup/forgot-password:** Supabase auth; forgot-password uses APP_URL for reset link. **OK.** (Password reset “not configured” message when base empty.)
- **terms/privacy:** Static/info. **OK.**
- **auth/callback:** Web OAuth only. **OK.**

### 4.2 Dashboard & calendar

- **Dashboard:** Fetches dashboard, today bookings, upcoming, weekly revenue, top services, activity. Location filter applied. **OK.**
- **Calendar:** Uses bookings API; date range and filters. **OK.**

### 4.3 Bookings

- **List:** GET bookings with date range; refresh; empty/error states; navigate to detail or new. **OK.**
- **Detail:** GET booking; actions (start journey, complete, cancel, ETA, etc.); at-home en-route sends location periodically. **OK.**
- **New:** Create booking flow; client (search/create), service, date/time, location, payment; uses hold/consume or direct create. **OK.**

### 4.4 Clients

- **Tab:** Clients, serviced, conversations; create client; start conversation. **OK.**
- **Detail [id]:** Client detail; API correct. **OK.**

### 4.5 Messaging

- **Index:** List conversations. **OK.**
- **Detail [id]:** Conversation + messages; send message; mark read; retract offer; delete; keyboard avoidance. **OK.**

### 4.6 Custom requests

- **Index:** List; handles array or `data.data`. **OK.**
- **Detail [id]:** Load request; send offer (price, duration, staff, location, scheduled_at, travel_fee for at_home); uses `/api/provider/team` for staff. **OK** (see staff/team note in 3.3).

### 4.7 Locations

- **List:** GET locations; add/edit/delete. **OK.**
- **Add:** Address autocomplete (Mapbox geocode), single address field, autofill. **OK** (fixed in prior work).
- **Edit [id]:** Same address flow; PATCH location. **OK.**

### 4.8 Catalogue & services

- **Catalogue index:** Services + categories; reorder, toggle, delete; navigate to [id]. **OK.**
- **Catalogue [id]:** Service detail; addons; edit (or “edit in portal”). **OK.**
- **Service form:** Categories, reference data, staff; create/update service. **OK.**

### 4.9 Products & inventory

- **Products list:** List; modal add/edit; create/update/delete. **OK.**
- **Product form:** Brands, suppliers, categories, reference data; upload image (fetch APP_URL + /api/upload). **OK.**
- **Inventory:** Reports products inventory. **OK.**

### 4.10 Settings (sample)

- **Business:** GET/PATCH settings/business; logo upload. **OK.**
- **Notification preferences:** GET/PATCH; test. **OK.**
- **Booking link:** GET/PATCH. **OK.**
- **Calendar integration:** Syncs, auth URL, trigger sync. **OK.**
- **Travel fees, tips, payout-accounts, note-templates, time-off-types, referral-sources, resource-groups, etc.:** All use correct provider APIs. **OK.**

### 4.11 Screens that redirect or “manage on web”

- **[slug].tsx:** Catch-all; message “Manage this in the provider dashboard on the web.” **By design.**
- **Search (app):** Message to use provider dashboard on web. **By design.**
- **Reports (more):** “For full reports … use the provider dashboard on the web.” **By design.**
- **Packages-list:** Create package opens web URL. **By design.**
- **Marketing:** “Use the provider portal to build and send campaigns.” **By design.**
- **Automations, forms, recurring-appointments, delete-account-info, etc.:** Similar “use web” where mobile doesn’t implement full flow. **By design.**

### 4.12 Onboarding

- **GET /api/provider/setup-status;** shows steps; “Complete on web” + Continue to app. **OK.**

### 4.13 Billing / invoice download

- **settings/billing.tsx:** “Download” now uses absolute URL (`APP_URL + /api/provider/invoices/[id]/download`) so native opens the correct host. **Note:** The download route requires provider auth; opening in the system browser may show 401 unless the user has an active web session. For a fully native experience, consider an authenticated download (e.g. fetch with Bearer and share the blob via expo-sharing) or open the URL in an in-app WebView that injects session.

---

## 5. Issues & recommendations

### 5.1 Fixed

| Item | Location | Fix applied |
|------|----------|-------------|
| Invoice download on native | `more/settings/billing.tsx` | Download button now uses absolute URL (`APP_URL + path`). If the user gets 401 when the link opens in the system browser, consider authenticated fetch + share or in-app WebView with session. |

### 5.2 Data/API checks (verified)

| Item | Status |
|------|--------|
| Team API | **Verified.** `GET /api/provider/team` returns `successResponse(transformedStaff)` → `{ data: staff[] }`. Api client unwraps to `data = staff[]`. Custom-requests [id] uses `Array.isArray(teamData) ? teamData : []` and expects `{ id, name }`; team route returns `name` (and id). **OK.** |
| Reference data | **Verified.** `GET /api/provider/reference-data?type=...` returns `successResponse(groupedData)` → `{ data: { service_type: [], availability: [], tax_rate: [], product_unit: [] } }`. Each item has `value` and `label`. Service-form and product-form use `refObj.service_type`, `refObj.availability`, `refObj.tax_rate`, `refObj.product_unit` with fallbacks. **OK.** |

### 5.3 Optional improvements

- **Error handling:** Some screens show generic “Error” or toast; consider consistent error message extraction from `res.error.message` or API error body.
- **Offline:** OfflineBar exists; list/detail screens could cache last payload for offline read (optional).
- **Loading timeouts:** index has profile timeout; other heavy screens (e.g. reports) could add timeouts or “Retry” for long waits.

---

## 6. Summary

- **Structure:** Mapped; auth → app → tabs → more and nested stacks are clear. No orphan routes found.
- **APIs:** All provider screens use `api` from `@/lib/api-client`; endpoints align with web API (provider and me). No stray or duplicate base URLs.
- **Data:** Response handling is mostly consistent (array vs `data` unwrap). Only team/reference-data shapes worth confirming.
- **Functionality:** Core flows (auth, dashboard, bookings, clients, messaging, custom requests, locations, catalogue, products, settings) are wired and correct except invoice download on native.
- **By design:** Several features intentionally “use web” (search, full reports, packages creation, marketing, automations, delete account, etc.); no change needed unless product adds mobile flows.

**Next step:** Fix billing invoice download URL for native (absolute URL + auth if required), then optionally verify team and reference-data response shapes with backend.
