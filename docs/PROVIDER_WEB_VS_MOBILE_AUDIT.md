# Provider Web Portal vs Mobile App – Audit Report

**Scope:** Next.js web provider portal (`apps/web`) vs provider mobile app (`apps/provider`).  
**Includes:** Feature/screen inventory, API usage per platform, and gap analysis (including API-level gaps).

---

## 1. Web provider portal – page and API map

All provider UI lives under `apps/web/src/app/provider/`. Below: URL path, purpose, and main API endpoints used.

### 1.1 Root and dashboard

| Page path | Purpose | API endpoints |
|-----------|---------|----------------|
| `/provider` | Provider root / redirect | `GET /api/me/portal` |
| `/provider/dashboard` | Dashboard metrics | `GET /api/provider/dashboard` (optional `location_id`) |
| `/provider/get-started` | Setup checklist | `GET /api/provider/setup-status` |
| `/provider/onboarding` | Onboarding flow | `GET/POST /api/provider/onboarding/draft`, `POST /api/provider/onboarding`, suggest-zones; phone OTP via Supabase Auth (`updateUser` / `verifyOtp`) + `PATCH /api/me/profile` |

### 1.2 Bookings and schedule

| Page path | Purpose | API endpoints |
|-----------|---------|----------------|
| `/provider/bookings` | List/manage bookings | `GET /api/provider/bookings`, `GET /api/provider/bookings/[id]`, `POST /api/provider/bookings/bulk` |
| `/provider/bookings/[id]` | Booking detail | `GET/PATCH /api/provider/bookings/[id]`, additional-charges, request-payment, mark-paid, refund, start-journey, arrive, receipt/send, audit-log |
| `/provider/schedule` | Schedule hub | (links) |
| `/provider/time-blocks` | Time blocks | Time-blocks API |
| `/provider/recurring-appointments` | Recurring | Recurring-appointments API |
| `/provider/express-booking` | Express links | `GET /api/provider/booking-link`, express-booking |
| `/provider/routes` | Route planning | `GET /api/provider/routes`, `POST /api/provider/routes/optimize` |
| `/provider/waitlist` | Waitlist | `GET /api/provider/waitlist` |
| `/provider/waiting-room` | Waiting room | `GET/POST/PATCH/DELETE /api/provider/waiting-room` |
| `/provider/group-bookings` | Group bookings | Group-bookings API |

### 1.3 Clients and messaging

| Page path | Purpose | API endpoints |
|-----------|---------|----------------|
| `/provider/clients` | Clients list | `GET /api/provider/clients`, serviced, conversations, `GET/PATCH/POST /api/provider/clients` |
| `/provider/customers/[id]/profile` | Customer profile | `GET /api/provider/customers/[id]/profile` |
| `/provider/messaging` | Conversations | `GET /api/provider/conversations`, messages |
| `/provider/custom-requests` | Custom requests | `GET /api/provider/custom-requests`, `POST .../custom-requests/[id]/offers` |

### 1.4 Catalogue, services, products, e‑commerce

| Page path | Purpose | API endpoints |
|-----------|---------|----------------|
| `/provider/catalogue` | Catalogue hub | (links) |
| `/provider/catalogue/services` | Services | Services API, zone-selections |
| `/provider/catalogue/products` | Products | `GET /api/provider/products/metrics` |
| `/provider/resources` | Resources | Resources API |
| `/provider/forms` | Forms | `GET/POST/PUT/DELETE /api/provider/forms`, fields |
| `/provider/ecommerce/*` | E‑commerce hub, orders, returns, shipping, walk-in | Products, product-orders, returns, shipping-config, product-sales |
| `/provider/packages` | Packages | `GET/DELETE /api/provider/packages` |

### 1.5 Team and payroll

| Page path | Purpose | API endpoints |
|-----------|---------|----------------|
| `/provider/staff` | Staff | `GET/POST/PATCH/DELETE /api/provider/staff`, locations, reset-password |
| `/provider/team/*` | Days off, shifts, time-clock, totals, payroll, my-earnings | staff/days-off, time-clock, staff/totals, pay-runs |

### 1.6 Finance and payouts

| Page path | Purpose | API endpoints |
|-----------|---------|----------------|
| `/provider/finance` | Finance overview | `GET /api/provider/finance`, payouts, payout-accounts, `GET /api/provider/finance/export` |
| `/provider/finance/vat-reports` | VAT reports | `GET /api/provider/finance/vat-reports`, check-reminders, mark-remitted |
| `/provider/payouts` | Payouts | `GET /api/provider/payouts`, next-date |
| `/provider/payouts/statements` | Statements | `GET /api/provider/payouts/statements` |

### 1.7 Reports (web has many dedicated report pages)

| Area | Examples | API endpoints |
|------|----------|----------------|
| Business | overview, comparison, dashboard | `GET /api/provider/reports/business/*` |
| Bookings | summary, cancellations, no-shows, status | `GET /api/provider/reports/bookings/*` |
| Clients | summary, new, retention, LTV | `GET /api/provider/reports/clients/*` |
| Staff | hours, performance | `GET /api/provider/reports/staff/*` |
| Sales | summary, services | `GET /api/provider/reports/sales/*` |
| Payments | summary, payouts, methods, refunds | `GET /api/provider/reports/payments/*` |
| Products | sales, top, inventory | `GET /api/provider/reports/products/*` |
| Packages | sales, usage | `GET /api/provider/reports/packages/*` |
| Gift cards | sales, redemptions | `GET /api/provider/reports/gift-cards/*` |

### 1.8 Marketing and explore

| Page path | Purpose | API endpoints |
|-----------|---------|----------------|
| `/provider/explore` | Provider posts | `GET /api/explore/posts/mine`, `DELETE /api/explore/posts/[id]` |
| `/provider/explore/[id]`, edit, new | Post detail, edit, new | Explore posts/comments API |
| `/provider/marketing/*` | Campaigns, automations, blast | `GET /api/provider/automations`, campaigns, twilio-integration |

### 1.9 Settings (selection)

| Page path | Purpose | API endpoints |
|-----------|---------|----------------|
| `/provider/settings` | Settings hub | `GET /api/me/provider`, `GET /api/provider/profile` |
| `/provider/settings/verification` | Verification (Sumsub) | `GET /api/provider/verification/status`, sumsub/token |
| `/provider/settings/billing` | Billing | billing, payment-methods, invoices, download |
| `/provider/settings/payout-accounts` | Payout accounts | Payout-accounts API |
| `/provider/settings/operating-hours` | Operating hours | locations, PATCH locations/[id] |
| `/provider/settings/appointment-activity/*` | Online booking, blocked time, group, waitlist, resources, business-details, closed-periods | booking-link, online-booking, online-booking-mangomint, group-bookings, waitlist, resources, availability-blocks |
| `/provider/settings/service-area`, service-zones | Service area/zones | service-area, zone-selections, suggest |
| `/provider/settings/distance` | Distance | `GET/PATCH /api/provider/distance-settings` |
| `/provider/settings/customer-visibility` | Customer visibility | `GET/PATCH /api/provider/customer-visibility` |
| `/provider/settings/locations` | Locations | Locations CRUD |
| `/provider/settings/gallery` | Gallery | profile, gallery |
| `/provider/settings/addons` | Addons | Addons API |
| `/provider/settings/team/roles` | Team roles | `GET/POST/PATCH/DELETE /api/provider/roles` |
| `/provider/settings/team/permissions` | Staff permissions | `GET/PATCH /api/provider/staff/[id]/permissions` |
| `/provider/settings/sales/*` | Tips, travel-fees, upselling, taxes, receipt, gift-cards | settings/sales/*, travel-fees, travel-fees/platform-limits |
| `/provider/settings/ads` | Paid ads | `GET /api/provider/ads/campaigns`, performance, packs, POST/PATCH campaigns |
| `/provider/settings/integrations/email` | Email | email-integration, test |
| `/provider/settings/integrations/twilio` | Twilio | twilio-integration, balance, test |
| `/provider/settings/note-templates` | Note templates | Note-templates API |
| `/provider/settings/services/memberships` | Membership plans | membership-plans API |
| `/provider/settings/notifications` | Notification prefs | notification-preferences |
| `/provider/account/profile` | Account profile | `GET/PATCH /api/me/profile`, subscription |
| `/provider/subscription` | Subscription | subscription, upgrade, initialize-payment, cancel, renew |
| `/provider/settings/upgrade-to-salon` | Upgrade to salon | `POST /api/provider/upgrade-to-salon` |

### 1.10 Other

| Page path | Purpose | API endpoints |
|-----------|---------|----------------|
| `/provider/locations` | Locations CRUD | Locations API |
| `/provider/reviews` | Reviews | `GET /api/provider/reviews`, respond, moderate |
| `/provider/analytics` | Analytics | `GET /api/provider/analytics` |
| `/provider/orders` | Orders | Product-orders API |

---

## 2. Provider mobile app – screen and API map

Routes are file-based (Expo Router). API usage: `useApi`, `useApiMutation`, `api.get/post/patch/delete`.

### 2.1 Tabs

| Route | Purpose | API endpoints |
|-------|---------|----------------|
| `(tabs)/dashboard` | Dashboard | `GET /api/provider/dashboard`, bookings, reports/weekly-revenue, top-services, activity |
| `(tabs)/calendar` | Calendar | bookings, team, time-blocks, locations, waiting-room/count, check-availability |
| `(tabs)/clients` | Clients | clients, serviced, conversations, create, conversations/create |
| `(tabs)/more` (+ nested) | More menu and all sub-screens | See below |

### 2.2 More – bookings and schedule

| Route | Purpose | API endpoints |
|-------|---------|----------------|
| `more/bookings`, `more/bookings/[id]`, `more/bookings/new` | Bookings list, detail, new | bookings, available-slots, mark-paid, refund, start-journey, arrive, location |
| `more/recurring-appointments` | Recurring | recurring-appointments |
| `more/group-bookings` | Group bookings | group-bookings, participants |
| `more/time-blocks` | Time blocks | time-blocks |
| `more/days-off` | Days off | staff, staff/[id]/days-off |
| `more/routes` | Routes | `GET /api/provider/routes` only (no optimize) |
| `more/express-booking` | Express booking | booking-link, express-booking |

### 2.3 More – clients, messaging, support

| Route | Purpose | API endpoints |
|-------|---------|----------------|
| `more/clients/[id]` | Client detail | `GET /api/provider/clients/[id]` |
| `more/messaging/*` | Conversations | conversations, messages |
| `more/support-tickets/*`, `more/contact-support` | Support | `GET/POST /api/me/support-tickets`, messages |

### 2.4 More – catalogue, products, e‑commerce

| Route | Purpose | API endpoints |
|-------|---------|----------------|
| `more/products*`, `more/product-form` | Products | products, brands, suppliers, product-categories, reference-data |
| `more/walk-in-sale` | Walk-in sale | products, product-sales |
| `more/product-orders` | Product orders | product-orders |
| `more/product-returns` | Returns | returns |
| `more/inventory` | Inventory | `GET /api/provider/reports/products/inventory` |
| `more/packages-list` | Packages | packages |
| `more/forms`, `more/resources*` | Forms, resources | forms, resources, resource-groups |

### 2.5 More – team and settings (selection)

| Route | Purpose | API endpoints |
|-------|---------|----------------|
| `more/team*` | Team | staff, staff/totals, staff/[id]/totals |
| `more/locations/[id]` | Edit location | locations/[id] |
| `more/settings/*` | Business, verification, online-booking, payout-accounts, payments, billing, notifications, blocked-time, closed-periods, group-appointments, referral-sources, cancellation-policies/reasons, operating-hours, note-templates, time-off-types, product-categories, shipping-config, email/twilio integration, service-zones, receipt-sequencing, addons, gift-cards, staff-permissions, automations, setup-status |
| `more/profile` | Profile | `GET/PATCH /api/me/profile`, `GET /api/me/avatar` |
| `more/gallery` | Gallery | gallery, profile |
| `more/upgrade-info` | Subscription | `GET /api/provider/subscription` |

### 2.6 More – finance, reports, other

| Route | Purpose | API endpoints |
|-------|---------|----------------|
| `more/finance` | Finance | `GET /api/provider/finance` |
| `more/invoices` | Invoices | invoices, send |
| `more/billing-history` | Billing history | `GET /api/provider/billing-history` |
| `more/transactions` | Transactions | transactions, transactions/export |
| `more/reports/*` | Revenue, bookings, clients, staff, payments, services, business, packages, gift-cards | reports/* (subset of web) |
| `more/notifications` | Notifications | notifications, mark-all-read, [id]/read |
| `more/rewards`, `more/gamification` | Gamification | gamification |
| `more/membership-plans` | Membership plans | membership-plans |
| `more/[slug]` | Catch-all | “Manage on web”, setup-status |

### 2.7 App-level

| Route | Purpose | API endpoints |
|-------|---------|----------------|
| `(app)/onboarding` | Onboarding | setup-status |
| `(app)/notifications` | Full-screen notifications | Same as more/notifications |
| `(app)/on-demand/incoming/[id]` | On-demand request | on-demand/requests/[id], accept, decline |
| `(app)/search` | Global search | `GET /api/provider/search` or “use web” |

### 2.8 Global / auth (provider flows)

| Where | Purpose | API endpoints |
|-------|---------|----------------|
| ProviderContext | Role check | `GET /api/me/role` |
| AccountStatusGuard | Account status | `GET /api/me/account-status`, `POST /api/me/reactivate-account` |
| PushNotificationsProvider | Device registration | `POST /api/me/devices` |
| SafetyPanicButton (booking detail) | Panic button | `POST /api/me/safety/panic` |
| CustomOfferSheet | Custom offer | categories, locations, team, custom-offers/create |

---

## 3. API inventory (representative)

All under `apps/web/src/app/api/provider/` (and `/api/me/*` for provider flows). Method + path + purpose.

### 3.1 Core

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/provider/dashboard` | Dashboard metrics |
| GET | `/api/provider/setup-status` | Setup completion |
| GET/PATCH | `/api/provider/profile` | Provider profile |
| GET | `/api/provider/activity` | Activity feed |
| GET | `/api/provider/analytics` | Analytics by period |
| GET | `/api/provider/search` | Global search |
| GET | `/api/provider/profile-completion` | Profile completion (mobile more index) |

### 3.2 Bookings

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/provider/bookings`, `bookings/bulk` | List, create, bulk |
| GET | `/api/provider/bookings/available-slots`, `check-availability` | Slots |
| GET/PATCH | `/api/provider/bookings/[id]` | Detail, update |
| POST | `bookings/[id]/location`, mark-paid, refund, request-payment, send-payment-link, start-journey, arrive, start-service, verify-qr | Booking actions |
| GET | `bookings/[id]/additional-charges`, events, payments, receipt, audit-log | Booking sub-resources |
| POST | `bookings/[id]/additional-charges/[chargeId]/mark-paid` | Mark charge paid |
| GET/PATCH | `bookings/[id]/resources` | Booking resources |

### 3.3 Waitlist and waiting room

| Method | Path | Purpose |
|--------|------|---------|
| GET/PATCH/DELETE | `/api/provider/waitlist`, `waitlist/[id]` | Waitlist CRUD |
| POST | `waitlist/[id]/notify`, quick-book | Notify, quick-book |
| GET | `waitlist/matches` | Matches |
| GET/POST/PATCH/DELETE | `/api/provider/waiting-room`, `waiting-room/[id]` | Waiting room |
| GET | `waiting-room/count` | Count by location |

### 3.4 Clients and conversations

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PATCH | `/api/provider/clients`, `clients/[id]` | Clients CRUD |
| GET | `clients/serviced`, `clients/conversations` | Serviced, with conversations |
| POST | `clients/create` | Create client (alt) |
| GET | `/api/provider/customers/[id]/profile` | Customer profile (provider view) |
| GET/POST | `/api/provider/conversations` | List, create |
| GET/PATCH/DELETE | `conversations/[id]` | Detail, update, delete |
| POST | `conversations/[id]/messages`, `conversations/[id]/read` | Messages, mark read |

### 3.5 Custom requests and offers

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/provider/custom-requests`, `custom-requests/[id]` | List, detail |
| POST | `custom-requests/[id]/offers` | Send offer |
| POST | `custom-offers/create`, `custom-offers/[id]/retract` | Create, retract |

### 3.6 Services, resources, forms

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PATCH/DELETE | `/api/provider/services`, `services/[id]` | Services CRUD |
| GET | `services/[id]/resources` | Service resources |
| GET/POST/PUT/DELETE | `/api/provider/addons` | Addons |
| GET/POST/PATCH/DELETE | `/api/provider/resources`, `resources/[id]` | Resources |
| GET/POST/PATCH/DELETE | `/api/provider/resource-groups`, `resource-groups/[id]` | Resource groups |
| GET/POST/PUT/DELETE | `/api/provider/forms`, `forms/[id]`, `forms/[id]/fields` | Forms CRUD |
| GET | `/api/provider/reference-data` | Reference data |

### 3.7 Products and e‑commerce

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PATCH/DELETE | `/api/provider/products`, `products/[id]` | Products CRUD |
| GET | `products/metrics` | Product metrics |
| GET/POST/PATCH/DELETE | `/api/provider/product-categories` | Product categories |
| GET/POST | `/api/provider/brands`, `suppliers` | Brands, suppliers |
| GET/POST | `/api/provider/product-sales` | Walk-in sales |
| GET | `/api/provider/product-orders`, `product-orders/[id]` | Product orders |
| GET/POST/PATCH/DELETE | `/api/provider/packages` | Packages |
| GET/PATCH | `/api/provider/returns`, `returns/[id]` | Returns |
| GET/PUT | `/api/provider/shipping-config` | Shipping config |

### 3.8 Locations and service area

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PATCH/DELETE | `/api/provider/locations` | Locations CRUD |
| GET/PUT | `/api/provider/service-area` | Service area |
| GET/POST/PATCH/DELETE | `/api/provider/zone-selections` | Zone selections |
| GET | `zone-selections/suggest` | Suggest zones |
| GET | `/api/provider/service-zones/analytics` | Zone analytics |
| GET/PATCH | `/api/provider/distance-settings` | Distance |
| GET/PATCH | `/api/provider/customer-visibility` | Customer visibility |

### 3.9 Staff and team

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PATCH/DELETE | `/api/provider/staff`, `staff/[id]` | Staff CRUD |
| GET | `/api/provider/team` | Team list |
| GET/PUT/DELETE | `staff/[id]/locations` | Staff locations |
| GET/PATCH | `staff/[id]/permissions`, commission, notifications | Permissions, commission, notifications |
| GET/POST/DELETE | `staff/[id]/days-off` | Days off |
| GET/POST/PATCH/PUT | `staff/[id]/time-clock`, clock-in, clock-out | Time clock |
| GET | `staff/[id]/totals`, `staff/totals` | Totals |
| POST | `staff/[id]/reset-password`, invite | Reset password, invite |
| GET/PATCH | `staff/[id]/settings` | Staff settings (web) |
| GET/POST/PATCH/DELETE | `/api/provider/roles` | Roles |
| GET/POST | `/api/provider/shifts` | Shifts |
| GET/POST | `/api/provider/time-clock`, clock-in-pin | Time clock (all), PIN |
| GET/POST | `/api/provider/pay-runs` | Pay runs |
| GET | `pay-runs/my-earnings` | My earnings |

### 3.10 Time and availability

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/DELETE | `/api/provider/time-blocks` | Time blocks |
| GET/POST/PUT/DELETE | `/api/provider/availability-blocks` | Closed periods |
| GET/POST/PATCH/DELETE | `/api/provider/blocked-time-types` | Blocked time types |
| GET/POST/PATCH/DELETE | `/api/provider/time-off-types` | Time-off types |

### 3.11 Finance and payouts

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/provider/finance` | Finance summary |
| GET | `/api/provider/finance/export` | Export (web) |
| GET | `/api/provider/finance/vat-reports` | VAT reports |
| GET | `finance/vat-reports/check-reminders` | VAT reminders |
| PATCH | `finance/vat-reports/[id]/mark-remitted` | Mark remitted |
| GET/POST | `/api/provider/payouts` | Payouts list, request |
| GET | `payouts/next-date`, `payouts/statements` | Next date, statements (web) |
| GET/PATCH/DELETE | `/api/provider/payout-accounts` | Payout accounts |
| GET/POST/DELETE/PATCH | `/api/provider/payment-methods` | Payment methods |
| GET | `/api/provider/transactions` | Transactions |
| POST | `transactions/export` | Export (mobile) |
| GET | `/api/provider/invoices` | Invoices |
| GET/PATCH/POST | `invoices/[id]/download`, send, pay | Download, send, pay |
| GET | `/api/provider/billing-history` | Billing history (mobile) |

### 3.12 Settings

| Method | Path | Purpose |
|--------|------|---------|
| GET/PATCH | `/api/provider/settings/billing` | Billing settings |
| GET/PATCH | `/api/provider/settings/business` | Business settings |
| GET/PATCH | `/api/provider/settings/business-details` | Business details |
| GET/PATCH | `/api/provider/settings/online-booking` | Online booking |
| GET/PATCH | `/api/provider/settings/online-booking-mangomint` | Mangomint (web) |
| GET/PATCH | `/api/provider/settings/group-bookings` | Group booking settings |
| GET/PATCH | `/api/provider/settings/waitlist` | Waitlist settings |
| GET/PATCH | `/api/provider/settings/appointments` | Appointment defaults |
| GET/PATCH | `/api/provider/settings/sales/*` | Tips, taxes, receipt, upselling, gift-cards |
| GET/PATCH | `/api/provider/settings/payments` | Payment settings |
| GET | `/api/provider/booking-link` | Booking link |
| PATCH | `/api/provider/booking-link` | Update booking link |
| GET/PATCH | `/api/provider/distance-settings` | Distance |
| GET/PATCH | `/api/provider/customer-visibility` | Customer visibility (web) |
| GET/PUT | `/api/provider/shipping-config` | Shipping |
| GET/PATCH | `/api/provider/settings/operating-hours` | Operating hours |
| GET/PATCH | `/api/provider/travel-fees` | Travel fees |
| GET | `travel-fees/platform-limits` | Platform limits (web) |
| GET/PATCH | `/api/provider/notification-preferences` | Notification prefs |
| POST | `notification-preferences/test` | Test (mobile) |

### 3.13 Integrations and verification

| Method | Path | Purpose |
|--------|------|---------|
| GET/PUT | `/api/provider/email-integration` | Email integration |
| POST | `email-integration/test`, send-test | Test (web/mobile) |
| GET/PUT | `/api/provider/twilio-integration` | Twilio |
| GET | `twilio-integration/balance`, stats | Balance, stats |
| GET | `/api/provider/calendar/providers` | Calendar providers (web) |
| GET | `/api/provider/verification/status` | Verification status |
| GET | `/api/provider/verification/sumsub/token` | Sumsub token |
| POST | `/api/provider/upgrade-to-salon` | Upgrade to salon (web) |

### 3.14 Reports (subset; web has many more)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/provider/reports/weekly-revenue` | Weekly revenue |
| GET | `/api/provider/reports/top-services` | Top services |
| GET | `/api/provider/reports/business/overview` | Business overview |
| GET | `/api/provider/reports/bookings` | Bookings report |
| GET | `/api/provider/reports/clients` | Clients report |
| GET | `/api/provider/reports/staff` | Staff report |
| GET | `/api/provider/reports/payments` | Payments report |
| GET | `/api/provider/reports/products/*` | Products, sales, top, inventory |
| GET | `/api/provider/reports/packages/*` | Packages |
| GET | `/api/provider/reports/gift-cards/*` | Gift cards |

### 3.15 Marketing and ads

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/provider/ads/campaigns` | Ad campaigns (web) |
| POST/PATCH | `ads/campaigns` | Campaigns CRUD |
| GET | `ads/performance`, `ads/packs` | Performance, packs |
| GET/POST/PATCH/DELETE | `/api/provider/automations` | Automations |
| GET | `automations/[id]/executions` | Executions (web) |
| GET/POST | `/api/provider/campaigns` | Blast campaigns (web) |

### 3.16 Other provider APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PATCH/DELETE | `/api/provider/gallery` | Gallery |
| GET/POST/PATCH/DELETE | `/api/provider/referral-sources` | Referral sources |
| GET/POST/PATCH/DELETE | `/api/provider/cancellation-reasons` | Cancellation reasons |
| GET/POST/PATCH/DELETE | `/api/provider/cancellation-policies` | Cancellation policies |
| GET/POST/PATCH/DELETE | `/api/provider/note-templates` | Note templates |
| GET/POST | `/api/provider/recurring-appointments` | Recurring |
| GET/POST/PATCH/DELETE | `/api/provider/group-bookings` | Group bookings |
| GET | `/api/provider/reviews` | Reviews |
| POST | `reviews/[id]/respond` | Respond |
| GET/PATCH | `/api/provider/returns` | Returns |
| GET | `/api/provider/routes` | Routes |
| POST | `routes/optimize` | Optimize (web) |
| GET/POST/PATCH/DELETE | `/api/provider/notifications` | Notifications |
| GET | `/api/provider/subscription` | Subscription |
| POST | `subscription/upgrade`, initialize-payment, cancel, renew | Subscription actions |
| POST | `/api/provider/subscriptions/create` | Create subscription (web checkout) |
| GET/POST | `/api/provider/gamification` | Gamification |
| GET/POST/PATCH/DELETE | `/api/provider/membership-plans` | Membership plans |
| GET/POST | `/api/provider/onboarding*` | Onboarding |
| GET/POST/PATCH/DELETE | `/api/provider/on-demand/requests` | On-demand |
| POST | `on-demand/requests/[id]/accept`, decline | Accept, decline |
| GET/POST/PUT/DELETE | `/api/provider/yoco/*` | Yoco |

### 3.17 /api/me/* used in provider flows

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/me/portal` | Portal type |
| GET | `/api/me/role` | Current role |
| GET/PATCH | `/api/me/profile` | User profile |
| GET | `/api/me/provider` | Provider info |
| PUT | `/api/me/password` | Change password |
| POST | `/api/me/deactivate` | Deactivate account |
| GET | `/api/me/account-status` | Account status |
| POST | `/api/me/reactivate-account` | Reactivate (mobile guard) |
| POST | `/api/me/devices` | Register device / push (mobile) |
| GET/POST | `/api/me/support-tickets` | Support tickets (mobile) |
| GET | `/api/me/support-tickets/[id]` | Ticket detail |
| POST | `/api/me/support-tickets/[id]/messages` | Add message |
| POST | `/api/me/safety/panic` | Safety panic (mobile) |
| GET | `/api/me/avatar` | Avatar (mobile profile) |

---

## 4. Gap analysis

### 4.0 Parity summary (mobile vs web)

| Area | Web | Mobile | Gap summary |
|------|-----|--------|-------------|
| **Core ops** | Bookings, calendar, appointments, schedule | Native: bookings, calendar tab, bookings/new | Parity (native). |
| **Clients & messaging** | Clients, messaging, custom-requests | Native: clients tab, messaging, custom-requests | Parity. |
| **Team** | Team, members, shifts, days-off, time-clock, payroll, totals, my-earnings | Native: team, payroll; Finance hub → Team totals & My earnings (native screens) | Parity; Team totals and My earnings are native (more/team-totals, more/my-earnings). |
| **Catalogue & services** | Catalogue, services, products, packages (incl. new) | Native: catalogue, services, products; packages list + "Open web" for create/edit | Package create/edit is web-only; mobile shows list and opens WebView for full editor. |
| **E-commerce** | Ecommerce, products, orders, returns, shipping, walk-in | Native: products, product-orders, product-returns, shipping-config, walk-in-sale | Parity. |
| **Finance** | Finance, payouts, invoices, payments, VAT reports | Native: finance, payouts, invoices, billing-history; Finance hub → VAT reports (native more/vat-reports) | Parity. |
| **Reports** | Reports hub + 30+ sub-reports | Native: reports index + main categories; "All report types on web" opens portal | All report entry points native. |
| **Settings** | 50+ settings pages | Native: settings index + 50+ sub-screens; calendar links, display prefs, receipt sequencing, ads, marketing-integrations native (More → Settings) | Parity. |
| **Engagement** | Reviews, messaging, marketing, explore | Native: reviews, messaging, marketing hub, promotions, explore-posts; Automations create is native (settings/automations-create) | Parity. |
| **Subscription & billing** | Subscription, upgrade, billing, invoices | Native: subscription; renew/upgrade and invoice links open in WebView (Paystack) | Payment flows intentionally in WebView. |
| **Onboarding & setup** | Onboarding, get-started, setup-status | Native: onboarding, setup-status; some steps → WebView (e.g. verification) | Setup-status maps to native where possible. |
| **Other** | Embed, front-desk, routes, waitlist, express-booking, recurring, group-bookings, time-blocks, resources, forms | Native: routes, waitlist, express-booking, recurring, group-bookings, time-blocks, resources, forms; Forms "Create" opens native form modal | Embed is web only (widget). Front-desk (web) vs waiting-room (mobile). |

**Web-only (no mobile equivalent):** Embed (`/provider/embed`). Package create/edit (full) — mobile list native, create/edit → "Open web" (WebView). VAT reports, Team totals, My earnings are native on mobile (Finance & billing hub).

**How "portal" works on mobile:** The in-app portal (`more/portal?path=...&title=...`) loads provider web paths in the in-app browser (WebView) for flows with no native screen (e.g. package create/edit, some verification links). VAT reports, team totals, my earnings, reports index, settings sub-pages, forms create, and automations create use native screens. See [REDIRECTS_BY_PLATFORM.md](./REDIRECTS_BY_PLATFORM.md).

**Mobile uses WebView (intentional):** Subscription renew/upgrade payment, billing invoice links, onboarding (optional), setup-status steps with no native screen, verification (e.g. ID), Express booking "Manage links", Packages "Open web", delete account, upgrade plan. User stays in app and authenticated.

**Recommendations:** (1) Done — VAT reports, Team totals, My earnings, reports sub-pages, settings (calendar links, receipt sequencing, ads, marketing-integrations), Forms create, Automations create are native. (2) Keep as WebView — Subscription payment, invoice PDFs, verification, delete account, upgrade flow, package create/edit. (3) Keep [REDIRECTS_BY_PLATFORM.md](./REDIRECTS_BY_PLATFORM.md) and [MORE_MENU_ALIGNMENT.md](../apps/provider/docs/MORE_MENU_ALIGNMENT.md) updated. Reference: [PROVIDER_APP_AUDIT.md](./PROVIDER_APP_AUDIT.md).

### 4.1 Web-only (features or API usage not on mobile)

| Area | Gap |
|------|-----|
| **Routes** | Route optimization: `POST /api/provider/routes/optimize` – web only; mobile has `GET /api/provider/routes` only. |
| **Bookings** | Bulk create: `POST /api/provider/bookings/bulk` – web only. |
| **Booking detail** | Request payment, send payment link, additional charges, receipt/send, audit-log – web; mobile has mark-paid, refund, start-journey, arrive. |
| **Staff** | `GET/PATCH /api/provider/staff/[id]/settings`, invite – web team member edit; mobile has different surface. |
| **Pay runs** | Create/approve pay runs – web payroll; mobile has my-earnings, no pay run management. |
| **Payouts** | `GET /api/provider/payouts/statements` – web only. |
| **Finance** | `GET /api/provider/finance/export` – web only. |
| **VAT** | Full VAT reports and mark-remitted – web; mobile limited or web link. |
| **Travel fees** | `GET /api/provider/travel-fees/platform-limits` – web only. |
| **Customer visibility** | `GET/PATCH /api/provider/customer-visibility` – web only. |
| **Calendar** | `GET /api/provider/calendar/providers` and OAuth – web; mobile often “manage on web”. |
| **Online booking** | Mangomint: `GET/PATCH /api/provider/settings/online-booking-mangomint` – web only. |
| **Ads** | `GET /api/provider/ads/*` (campaigns, performance, packs), POST/PATCH campaigns – web only. |
| **Campaigns** | `POST /api/provider/campaigns/[id]/send` – web blast; mobile may link to web. |
| **Automations** | `GET /api/provider/automations/[id]/executions` – web only. |
| **Subscription** | Checkout: `POST /api/provider/subscriptions/create` – web; mobile may use WebView. |
| **Upgrade to salon** | `POST /api/provider/upgrade-to-salon` – web only. |
| **Reports** | Many report types (business/dashboard, comparison, bookings/status, payments/refunds/methods, packages/usage, etc.) – web only. |
| **Settings** | Service zones analytics, calendar display-preferences, calendar links, receipt-template, Yoco devices – web or more complete on web. |

### 4.2 Mobile-only (features or API usage not on web)

| Area | Gap |
|------|-----|
| **Safety** | `POST /api/me/safety/panic` – mobile booking detail only; web not in same place. |
| **Account status** | `GET /api/me/account-status`, `POST /api/me/reactivate-account` – mobile AccountStatusGuard; web may handle differently. |
| **Push** | `POST /api/me/devices` – mobile only (OneSignal). |
| **Support tickets** | `GET/POST /api/me/support-tickets`, detail, messages – mobile; web provider portal may not have ticket list/detail. |
| **Profile completion** | `GET /api/provider/profile-completion` – mobile more index; web get-started/onboarding. |
| **Billing history** | `GET /api/provider/billing-history` – mobile screen; web may surface under billing. |
| **Transactions export** | `POST /api/provider/transactions/export` – mobile; web has finance/export. |
| **Notification test** | `POST /api/provider/notification-preferences/test` – mobile; web may or may not. |
| **Email send-test** | `POST /api/provider/email-integration/send-test` – mobile; web has test. |
| **On-demand** | On-demand incoming detail and accept/decline – mobile; web may be less prominent. |
| **Catch-all** | `more/[slug]` “manage on web” – mobile only. |

### 4.3 API gaps (consumed by only one platform)

- **Web-only consumed:**  
  `routes/optimize`, `bookings/bulk`, `staff/[id]/settings`, `payouts/statements`, `finance/export`, `travel-fees/platform-limits`, `customer-visibility`, `calendar/providers` (and auth), `settings/online-booking-mangomint`, `ads/*`, `campaigns/[id]/send`, `automations/[id]/executions`, `subscriptions/create`, `upgrade-to-salon`, many report endpoints.

- **Mobile-only consumed:**  
  `api/me/safety/panic`, `api/me/account-status`, `api/me/reactivate-account`, `api/me/devices`, `api/me/support-tickets` (list, detail, messages), `api/provider/profile-completion` (in more index), `api/provider/billing-history`, `api/provider/transactions/export`, `api/provider/notification-preferences/test`, `api/provider/email-integration/send-test`.

- **Missing for parity:**  
  - Mobile: No route optimization, bulk bookings, pay run create/approve, payout statements, finance export, VAT mark-remitted, customer-visibility, Mangomint, ads CRUD, campaign send, subscription checkout (may use WebView), upgrade-to-salon, many report types.  
  - Web: No safety panic in booking detail (or different placement), no device registration for push, possibly no support ticket list/detail in provider portal, possibly no account-status/reactivate flow as on mobile.

---

## 5. Summary

- **Web:** 160+ provider pages; full depth in reports, settings (calendar, ads, Mangomint, customer visibility, receipt template, VAT, pay runs, statements, finance export), route optimization, bulk bookings, booking receipt/audit-log/additional-charges, and subscription/upgrade flows.
- **Mobile:** Core flows covered (dashboard, calendar, bookings, clients, messaging, custom requests, products, orders, returns, walk-in, team, finance, invoices, settings, notifications, support, verification); uses many of the same APIs; defers to web for search, packages create/edit, marketing campaigns, delete account, and several advanced settings.
- **Gaps:** (1) Web-only: reporting depth, route optimize, bulk bookings, pay runs, statements, finance export, VAT, customer visibility, calendar OAuth, Mangomint, ads, campaign send, automations executions, subscription checkout, upgrade-to-salon. (2) Mobile-only: safety panic, device registration, support tickets, account-status guard. (3) Several APIs are only called from one platform; aligning parity would require exposing or implementing the same features on both and, where needed, adding or sharing APIs.
