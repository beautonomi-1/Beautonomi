# Provider Mobile "More" Menu – Alignment with Web Portal & API

This document tracks alignment between the provider **mobile app** More menu, the **Next.js provider portal** (web), and **API/data/UI** usage. Use it to keep mobile and web in sync and to prioritise missing screens or fixes.

---

## 0. No route to web (native-first)

**The provider app does not route users to the web.** All features use native screens and APIs. There is no in-app link to open the web dashboard; providers stay in the mobile app. Do not add "Open on web" or portal links. The in-app portal screen (`more/portal`) exists for direct/deep links only and is not linked from any menu.

**Quick reference:** Finance & billing → `finance-billing-hub` (Earnings, Payroll, Invoices, Payouts, Billing history, Gift cards). Invoice/document and other web URLs (subscription payment, onboarding, setup, verification, express-booking, packages) open in the **in-app browser** (`more/in-app-browser`) so the user stays in the app and authenticated. Native screens preferred where possible (e.g. setup-status routes to native when the API returns app routes).

---

## 1. Route → Screen existence

| More menu item | Mobile route | Mobile screen exists? | Web portal equivalent |
|----------------|--------------|------------------------|------------------------|
| **Operations** | | | |
| Bookings | `more/bookings` | ✅ (list + `bookings/new`) | `/provider/bookings`, `/provider/appointments` |
| Recurring Appointments | `more/recurring-appointments` | ✅ | `/provider/recurring-appointments` |
| Group Bookings | `more/group-bookings` | ✅ | `/provider/group-bookings` |
| Waitlist | `more/waitlist` | ✅ | `/provider/waitlist` |
| Front Desk | `more/waiting-room` | ✅ | `/provider/front-desk`, `/provider/waiting-room` |
| Express Booking | `more/express-booking` | ✅ | `/provider/express-booking` |
| Resources | `more/resources` | ✅ | `/provider/resources` |
| Forms | `more/forms` | ✅ | (settings/forms) |
| Custom Requests | `more/custom-requests` | ✅ | `/provider/custom-requests` |
| Routes | `more/routes` | ✅ | `/provider/routes` |
| Time Blocks | `more/time-blocks` | ✅ | `/provider/time-blocks` |
| Days Off | `more/days-off` | ✅ | `/provider/team/days-off` |
| **E-Commerce & Products** | | | |
| Products & Inventory | `more/products` | ✅ | `/provider/ecommerce/products`, `/provider/catalogue/products` |
| Suppliers | `more/suppliers` | ✅ | (ecommerce/suppliers) |
| Inventory Manager | `more/inventory` | ✅ (via products-hub) | `/provider/reports/products/inventory` |
| Product Orders | `more/product-orders` | ✅ | `/provider/ecommerce/orders` |
| Returns & Refunds | `more/product-returns` | ✅ | `/provider/ecommerce/returns` |
| Shipping & Collection | `more/settings/shipping-config` | ✅ | `/provider/ecommerce/shipping` |
| Walk-in Sale | `more/walk-in-sale` | ✅ | `/provider/ecommerce/walk-in` |
| **Business** | | | |
| Catalogue | `more/catalogue` | ✅ | `/provider/catalogue` |
| Packages | `more/packages` | ✅ | `/provider/packages` |
| Team | `more/team` | ✅ | `/provider/team/members` |
| Staff Schedules | `more/staff-schedule` | ✅ | `/provider/team/shifts` (date-based) + weekly in shifts UI |
| Time Clock | `more/time-clock` | ✅ | `/provider/team/time-clock` |
| Payroll | `more/payroll` | ✅ | `/provider/team/payroll` |
| Finance | `more/finance` | ✅ | `/provider/finance` |
| Invoices | `more/invoices` | ✅ | (settings/billing/invoices) |
| Payouts | `more/payouts` | ✅ | (settings/payout-accounts, reports/payments/payouts) |
| Transaction History | `(tabs)/sales` | ✅ | `/provider/payments` |
| Sales History | `more/sales-history` | ✅ | `/provider/sales` |
| Gift Cards | `more/gift-cards` | ✅ | `/provider/settings/sales/gift-cards` |
| Transactions | `more/transactions-hub` | ✅ | (reports/payments) |
| Reports | `more/reports` | ✅ | `/provider/reports` |
| Analytics | `more/analytics` | ✅ | `/provider/analytics` |
| Activity | `more/activity` | ✅ (dashboard API) | (dashboard/activity) |
| Gallery | `more/gallery` | ✅ | `/provider/settings/gallery` |
| **Engagement** | | | |
| Reviews | `more/reviews` | ✅ | `/provider/reviews` |
| Messages | `more/messaging` | ✅ (list + `messaging/[id]`) | `/provider/messaging` |
| Marketing | `more/marketing` | ✅ | `/provider/marketing/campaigns` |
| Promotions | `more/promotions` | ✅ | (promotions) |
| Memberships | `more/membership-plans` | ✅ | (settings/services/memberships) |
| Explore | `more/explore-posts` | ✅ | `/provider/explore` |
| Notifications | `(app)/notifications` | (separate) | `/provider/notifications` |
| **Settings** | | | |
| Settings | `more/settings-account-hub` | ✅ (all native) | `/provider/settings` |
| Subscription | `more/subscription` | ✅ | `/provider/subscription` |
| Billing History | `more/billing-history` | ✅ | (settings/billing) |
| Rewards | `more/rewards` | ✅ | (gamification) |
| Badges & Gamification | `more/gamification` | ✅ | `/provider/gamification` |

---

## 2. API & data alignment (implemented screens)

### Team (`more/team.tsx`) & Team list (`more/team-list.tsx`)
- **APIs:** `GET /api/provider/staff`, `POST /api/provider/staff`, `POST /api/provider/staff/[id]/shifts`.
- **Data:** Staff list from `/api/provider/staff`; create (team-list) uses `email`, `name`, `phone`, `role` (+ locations, services, commission); shifts use `day_of_week`, `start_time`, `end_time`.
- **UI:** Team: list + "Add member" → team-list. When opened with `?add=1` (e.g. from Staff Schedules), Team opens team-list so the add flow starts in one step. team-list: full add flow (name, email, phone, role, locations, services, commission); all native. Web has more (permissions, notifications). No separate “Staff Schedules” step. Aligned with web intent; web has full TeamMemberCreateEditDialog (more fields).

### Staff Schedules (`more/staff-schedule.tsx`)
- **APIs:** `GET /api/provider/staff`, `GET /api/provider/staff/[id]/shifts`, `POST /api/provider/staff/[id]/shifts`, `DELETE /api/provider/staff/[id]/shifts/[scheduleId]`.
- **Data:** Weekly schedules from `staff_schedules` (not date-based `staff_shifts`). Shift shape: `id | null`, `staff_id`, `day_of_week`, `start_time`, `end_time`. Delete fixed to use staff_schedules delete (was incorrectly calling `/api/provider/shifts/[id]`).
- **UI:** Staff selector, add/edit/delete shift in sheet; “Add team member” links to Team with `?add=1`. Web uses date-based shifts (`staff_shifts`) for Team > Shifts; mobile focuses on weekly recurring (`staff_schedules`).

### Days Off (`more/days-off.tsx`)
- **APIs:** `GET /api/provider/staff`, `GET /api/provider/staff/[id]/days-off`, `POST /api/provider/staff/[id]/days-off`, `DELETE /api/provider/staff/[id]/days-off/[dayOffId]`.
- **Data:** POST body `{ date, reason?, type? }` matches API schema. Aligned with web.

### Products (`more/products.tsx`)
- **APIs:** `GET /api/provider/products`, `POST /api/provider/products`, `PATCH /api/provider/products/[id]`, `DELETE /api/provider/products/[id]`.
- **Data:** List shape `{ products, total, page, limit, total_pages }`; mobile uses same. Create/update: `name`, `retail_price`, `category`, `sku`, `quantity`, `low_stock_level`, `short_description`, `barcode`, `brand`, `supplier`, `supply_price` (including per variant). Web has additional fields (`measure`, `amount`, `tax_rate`, `image_urls`); mobile subset is valid and sufficient for core product management.

### Gallery (`more/gallery.tsx`)
- **APIs:** `GET /api/me/provider`, `PATCH /api/provider/profile` with `gallery`, `thumbnail_url`.
- **Data:** Same as web settings/gallery. Aligned.

### Explore Posts (`more/explore-posts.tsx`)
- **APIs:** `GET /api/explore/posts/mine`, `DELETE /api/explore/posts/[id]`, `POST /api/explore/posts`, `PATCH /api/explore/posts/[id]`, `POST /api/explore/upload`.
- **Data:** Uses same `ExplorePost` shape; list, create, edit (caption, status), delete — all native. Aligned.

### Bookings New (`more/bookings/new.tsx`)
- **APIs:** `GET /api/provider/services`, `GET /api/provider/team` (alias of staff), `GET /api/provider/settings/payments`, `GET /api/provider/referral-sources`, `GET /api/provider/clients?search=`, `GET /api/provider/bookings/available-slots`, `GET /api/provider/bookings/check-availability`, `POST /api/provider/bookings`, `POST /api/provider/conversations/create`.
- **Data:** Team from `/api/provider/team` matches staff list. Booking payload aligned with web create-booking flow.
- **UI:** Single flow for client, service, staff, slot, payment; aligned with web intent.

### Messaging (`more/messaging/[id].tsx`) & Clients (`more/clients/[id].tsx`)
- **APIs:** `GET /api/provider/conversations/[id]`, messages, mark-read, custom offers retract, delete conversation; `GET /api/provider/clients/[id]`.
- **Data:** Conversation and client detail shapes match web. Aligned.

### Payroll (`more/payroll.tsx`) & Gift Cards (`more/gift-cards.tsx`)
- **APIs:** Payroll: `GET /api/provider/pay-runs`, `POST /api/provider/pay-runs`, approve, mark-paid. Gift cards: `GET/PATCH /api/provider/settings/sales/gift-cards`. All native; no web.
- **Finance & billing hub:** Native links to Earnings, Payroll, Invoices, Payouts, Billing history, Gift cards. Providers never leave the app.

### Billing history & in-app browser
- **Billing history** (`more/billing-history.tsx`): `GET /api/provider/billing-history`; list of billing items. Invoice links open in the **in-app browser** (`more/in-app-browser`) so providers stay in the app and authenticated for PDFs/payment pages.
- **Setup status** (`more/settings/setup-status.tsx`): Steps from API use **native routes** where we have a screen (business, locations, gallery, operating hours, verification, Yoco, payouts, catalogue); other steps open in in-app browser. **Onboarding** screen offers "Complete setup in app" → navigates to Setup status so users can complete steps natively first.

### Activity (`more/activity.tsx`)
- **APIs:** `GET /api/provider/dashboard`.
- **Data:** Dashboard metrics (revenue, appointments today, balance, rating), reward points, recent point transactions — all native; no web link.

### Profile completion (More screen, `more/index.tsx`)
- **API:** `GET /api/provider/profile-completion`. Returns `{ completed, total, percentage, items }` where each item has `id`, `label`, `completed`, `required`, `route`.
- **Behaviour:** A “Complete your business profile” card is shown on the More screen when `items.length > 0` and `percentage < 100`. Card shows a progress bar, percentage, and a checklist (up to 6 items) with green check (done), red X (required incomplete), or gray circle (optional incomplete). Tapping the card goes to the first incomplete item’s screen; tapping a row navigates to that item’s screen. Data is refetched on screen focus and on pull-to-refresh.
- **Error handling:** If the API fails (e.g. 404 for no provider), a non-blocking message “Couldn’t load profile status” is shown with a “Try again” button that refetches. Card is hidden when there is no data.
- **i18n:** Card title, subtitle, and error message use `provider.profileCompletionTitle`, `provider.profileCompletionSubtitle`, `provider.profileCompletionLoadError`; retry uses `common.retry` (all locales: en, af, zu, st).
- **Mandatory for completion (required: true in API):** Business name, business description, logo/photo, phone & email, at least one location, first service, operating hours. **Optional:** Portfolio photos (gallery).
- **Route map (dedicated screens):** API routes are mapped so the card deep-links to: `more/settings/business` → `more/settings/business`; `more/settings/locations` → `more/locations`; `more/settings/hours` → `more/settings-operating-hours`; `more/catalogue` → `more/catalogue-offerings-hub`; `more/gallery` → `more/gallery`. **Business details** (`more/settings/business`), **Locations** (`more/locations` + `locations/add`, `locations/[id]`), and **Operating hours** (`more/settings-operating-hours`) are full screens with real APIs and UI: GET/PATCH `/api/provider/settings/business`; GET/POST `/api/provider/locations`, GET/PATCH/DELETE `/api/provider/locations/[id]`; GET/PATCH `/api/provider/settings/operating-hours`.

---

## 3. UI input alignment summary

| Screen | Key inputs | Match web? | Notes |
|--------|------------|------------|--------|
| Team (add member) | name, email, phone, role, shift preset; add/manage via Team → Add member → team-list | ✅ | All native; web has more (permissions, notifications); mobile subset. |
| Staff Schedules | staff, day, start_time, end_time | ✅ | Delete uses correct API. |
| Days Off | staff, date, reason | ✅ | |
| Products | name, retail_price, category, sku, quantity, low_stock_level, short_description, barcode, brand, supplier (+ variants in app) | ✅ | Web has more fields; optional on API. |
| Gallery | gallery array, thumbnail_url | ✅ | |
| Explore | list, delete, create, edit (caption, status) — all native | ✅ | |
| Bookings new | client, service, staff, date/slot, payment | ✅ | |

---

## 4. Implementation (audit pass – full API & UI)

The following were implemented or enhanced so every More menu item has a working screen with API and UI aligned to the web portal:

| Screen | API(s) | Implementation |
|--------|--------|----------------|
| **Activity** | `GET /api/provider/dashboard` | Dashboard metrics (revenue, appointments today, balance, rating), reward points, recent point transactions — all native; no web link. |
| **Waitlist** | `GET /api/provider/waitlist?status=&limit=100` | Status filter, list with customer, service, date — native. |
| **Time Blocks** | `GET /api/provider/time-blocks?date_from=&date_to=` | Current month blocks; add (name, date, start/end time) and delete — all native. |
| **Custom Requests** | `GET /api/provider/custom-requests` | List with customer, message, offers, status; tap → native detail. |
| **Finance** | `GET /api/provider/finance?range=month` | Earnings, transactions — native; Finance & billing hub in-app. |
| **Reviews** | `GET /api/provider/reviews?status=&limit=50` | Filter, list, respond — native. |
| **Analytics** | `GET /api/provider/analytics?period=month` | Revenue, upcoming bookings, customers — native. |
| **Bookings** | `GET /api/provider/bookings?start_date=&end_date=` | List; "New" → bookings/new; tap → native where implemented. |
| **Messages** | `GET /api/provider/conversations` | List; tap → `messaging/[id]`. |
| **Settings** | — | All native via settings-account-hub and more/settings/*. |
| **Subscription** | — | Native screen. |

No "Open on web" links for these flows; no in-app link to the web dashboard.

---

## 5. Fixes applied (this pass)

1. **Staff Schedule delete:** Mobile was calling `DELETE /api/provider/shifts/[id]` (date-based `staff_shifts`) with an id from `GET /api/provider/staff/[id]/shifts` (weekly `staff_schedules`). Added `DELETE /api/provider/staff/[id]/shifts/[scheduleId]` and updated mobile to use it; delete button only shown when `shift.id` is present.

---

## 6. Native-first update (in-app experience)

All features use native screens; the app uses in-app WebView for web-only flows (payment, onboarding, invoices, etc.) so the user stays authenticated. Settings & account: every item opens a native screen. Products & e-commerce, Catalogue, Finance (hub → earnings, payroll, invoices, payouts, billing history, gift cards; VAT reports, Team totals, My earnings are native). Resources & forms: native only (Forms create and Automations create open native screens). Billing invoice links, subscription payment, onboarding, setup-status links, verification, express-booking (“Manage links on web”), and packages (“Open web”) open in the **in-app browser** (`more/in-app-browser`). Subscription success uses postMessage to auto-return to native. Native flows preferred where possible.

---

## 7. Profile completion & Business / Locations / Hours (recent)

- **More screen:** Profile completion card shows when completion &lt; 100%: progress bar, checklist (green/red/gray), deep links. Uses `GET /api/provider/profile-completion`. Error state with retry; i18n for title, subtitle, error (en, af, zu, st). Refetch on focus and pull-to-refresh.
- **Business details** (`more/settings/business`): Full form with GET/PATCH `/api/provider/settings/business`. Logo upload via ImagePicker base64; fields: business name, description, email, phone, website, optional address.
- **Locations:** List (`more/locations`) with GET `/api/provider/locations`; Add (`more/locations/add`) with POST; Edit (`more/locations/[id]`) with GET/PATCH/DELETE. Required: name, address_line1, city, country.
- **Operating hours:** (`more/settings-operating-hours`): GET/PATCH `/api/provider/settings/operating-hours`. Per-location blocks with Mon–Sun open/closed and open/close times; time pickers (datetimepicker, time mode) for open/close; modal with Done. "Save hours" per location.
- **Validation i18n:** Form validation messages use `validation.*` keys (en, af, zu, st).
- **Language:** Users change app language at More → Settings & account → Language (`more/settings/language`); choice saved to AsyncStorage.

---

## 8. Recommended next steps

- **Activity:** Dashboard uses GET /api/provider/dashboard natively. All flows are now native.
- **Products:** Mobile has core fields (name, price, category, sku, quantity, variants, supply_price, etc.); web has more (measure, tax_rate, image_urls). Mobile subset is valid; optionally add more fields later if needed.
- **No web entry:** No "Open dashboard in browser" in Settings; all flows are native so providers never leave the app. Billing/invoice links open in the in-app browser (WebView); user stays authenticated.
