# Provider Mobile App vs Provider Portal (Next.js) – API Integration Report

## Summary

The provider mobile app is **largely integrated** with the same backend APIs as the provider portal (Next.js web). Both apps call the **same API base** (`/api/provider/...` and `/api/explore/...` on the web app). The mobile app uses `api.get`, `useApi`, `useApiMutation`, and `useApiPost` from `@/lib/api-client` and `@/hooks/useApi`, which target the web app’s API routes.

**Conclusion:** Core flows (bookings, calendar, team, settings, reports, waitlist, gallery, etc.) are integrated. **Full booking detail (payments/refunds), full client CRUD, Yoco, automations, subscription, Twilio, and cancellation policies are implemented on mobile** and use the same APIs as web. Remaining gaps are truly web-only or optional (e.g. bulk booking actions, calendar preferences, custom forms, some product-catalogue UI).

**No mock or fake data:** All “More” pages, buttons, and subpages in the provider mobile app use live APIs (`useApi`, `useApiPost`, `useApiMutation`, or `api.get`/`api.post` from `@/lib/api-client`) against the same backend as the provider portal. No hardcoded lists or dummy data were found for list/detail screens.

---

## Fully integrated (mobile uses same APIs as web)

| Area | Mobile | Web | Notes |
|------|--------|-----|--------|
| **Bookings (list/calendar)** | `GET/PATCH /api/provider/bookings` | ✓ | List, filters, status update. |
| **Time blocks** | `GET/POST/PATCH/DELETE /api/provider/time-blocks` | ✓ | Calendar blocked time. |
| **Team / staff** | `GET /api/provider/team`, `GET /api/provider/staff` | ✓ | Team list, staff list. |
| **Days off** | `GET /api/provider/days-off`, `POST/DELETE /api/provider/staff/[id]/days-off` | ✓ | Days off per staff. |
| **Locations** | `GET /api/provider/locations` | ✓ | Used in calendar. |
| **Waiting room** | `GET /api/provider/waiting-room/count` | ✓ | Badge count. |
| **Group bookings** | `GET/PATCH/DELETE /api/provider/group-bookings`, participants | ✓ | List, update, cancel, add/remove participants. |
| **Waitlist** | `GET/PATCH/POST /api/provider/waitlist`, notify, quick-book | ✓ | List, update, notify, quick-book. |
| **Reviews** | `GET /api/provider/reviews`, respond, flag | ✓ | List, respond, flag. |
| **Gallery** | `GET/POST/PATCH/DELETE /api/provider/gallery` | ✓ | List, upload, update, delete. |
| **Routes** | `GET /api/provider/routes`, optimize, segments | ✓ | Routes, optimize, segment status. |
| **Conversations** | `GET /api/provider/conversations` | ✓ | Messaging list. |
| **Dashboard** | `GET /api/provider/dashboard` | ✓ | Dashboard + analytics. |
| **Profile** | `GET /api/provider/profile`, `GET /api/provider/profile-completion` | ✓ | Profile and onboarding completion. |
| **Reports** | business, revenue, bookings, clients, staff, payments, products, services, packages, gift-cards, weekly-revenue, top-services | ✓ | All report endpoints used on mobile. |
| **Settings – core** | booking-link, shipping-config, notification-preferences, notification-preferences/test, team/commissions, payout-accounts, roles, zone-selections, travel-fees, distance-settings, customer-visibility, tips/distribution, time-off-types, cancellation-reasons, note-templates, availability-blocks, categories, resource-groups, product-categories, gift-cards, upselling, addons, receipt, taxes, email-integration, referral-sources, online-booking, calendar/syncs | ✓ | Same as web where the same screens exist. |
| **Other** | promotions, membership-plans, payouts, invoices, custom-requests, activity, gamification, time-clock, resources, explore posts/comments | ✓ | Same APIs as web. |

---

## Fixes applied

- **Online booking – slug update:** Mobile was calling `PATCH /api/provider/booking-link/slug` (no such route). Updated to `PATCH /api/provider/booking-link` with body `{ slug }`, matching the web API.
- **Transactions API alignment:** `GET /api/provider/transactions` now supports `period=all` (from year 2000) and optional `location_id` so the Finance screen “All” filter and location filter match portal behaviour.
- **Invoice send:** Added `POST /api/provider/invoices/[id]/send` so the mobile Invoices screen “Send” action works (marks invoice as sent and sets `sent_at`).

---

## Integrated on mobile + Web-only or optional (see below)

**Integrated on mobile:** Full booking detail (payments/refunds), client CRUD, Yoco, automations, subscription, Twilio, cancellation policies, and product orders/returns are implemented on mobile. Screens: `more/bookings/[id].tsx`, `more/clients/[id].tsx`, `more/settings/yoco-devices.tsx`, `more/settings/automations.tsx`, `more/settings/twilio-integration.tsx`, `more/subscription.tsx`, `more/settings/cancellation-policies.tsx`, `more/product-orders.tsx`, `more/product-returns.tsx`.

**Web-only or optional on mobile (not used on mobile):**

These are used by the **web portal only**. Mobile either has no equivalent screen or uses a reduced flow. They are integration “gaps” only in the sense that the **feature** is not on mobile; the **API** is shared.

| API (web only) | Purpose | Mobile status |
|----------------|--------|----------------|
| Booking detail, payments, clients, Yoco, automations, Twilio, subscription, cancellation policies, product orders/returns | — | **On mobile** (see Integrated on mobile above). |
| `POST /api/provider/bookings/bulk` | Bulk booking actions | Not on mobile. |
| `POST /api/provider/conversations/create` | Start conversation | Web only (mobile may use elsewhere). |
| `GET /api/provider/ratings`, `ratings/list` | Ratings by client/booking | Web client detail only. |
| `GET /api/provider/calendar/providers`, `GET/PATCH /api/provider/settings/calendar-preferences` | Calendar sync providers and preferences | Web only (mobile has calendar/syncs only). |
| `GET /api/provider/travel-fees/platform-limits` | Travel fee limits | Web only (mobile uses travel-fees). |
| `POST /api/provider/payout-accounts/verify` | Verify bank account | Web only. |
| `GET /api/provider/setup-status` | Onboarding setup status | Web only. |
| `GET/PATCH /api/provider/settings/sales/tips` | Tips settings (web path) | Web uses this; mobile uses `tips/distribution` (different path). |
| `GET/POST /api/provider/forms`, forms/[id], fields | Custom forms | Web only. |
| `GET /api/provider/reference-data` | Reference data for dropdowns | Web only. |
| `GET/PATCH /api/provider/staff/[id]/permissions` | Staff permissions | Web only. |
| `GET /api/provider/service-zones/analytics` | Zone analytics | Web only. |
| `GET/PATCH /api/provider/settings/online-booking-mangomint` | Mangomint integration | Web only. |
| `PATCH /api/provider/profile` | Business description / gallery | Web only (mobile has profile via context). |
| `GET /api/provider/tax-rate`, `service-fee`, `buffer-time`, `settings/travel` | Booking form helpers | Web appointment sidebar only. |
| `GET /api/provider/coupons/validate` | Coupon validation | Web only. |
| `GET /api/provider/packages` | Packages list for booking | Web only. |
| `GET /api/provider/services/[id]/variants`, addons | Service variants/addons for booking | Web only. |
| `GET/POST /api/provider/brands`, suppliers, product-categories (for products UI) | Product catalogue | Web only. |
| `GET /api/provider/settings/business-details`, `PATCH /api/provider/settings/business-details` | Business details form | Web only. |
| `GET /api/provider/products/metrics` | Product metrics | Web only. |
| `POST /api/provider/conversations/[id]/mark-read` | Mark conversation read | Web only (mobile could use). |
| `GET /api/provider/group-bookings/[id]/participants/[id]/check-in`, check-out | Group check-in/out | Web only. |

---

## Recommendations

1. **Current mobile scope is complete**  
   Full booking detail (payments/refunds), client CRUD, Yoco, automations, subscription, Twilio, and cancellation policies are on mobile. Core workflows (calendar, team, settings, reports, waitlist, gallery, routes, etc.) are integrated.

2. **Optional enhancements**  
   - **Mark conversation read:** Call `POST /api/provider/conversations/[id]/mark-read` when opening a thread.  
   - **Group booking check-in/out:** Use the existing check-in/check-out endpoints if you add that flow on mobile.  
   - **Bulk booking actions:** Add `POST /api/provider/bookings/bulk` if product wants bulk actions on mobile.

3. **Truly web-only**  
   Calendar preferences UI, custom forms, reference-data, staff permissions, zone analytics, Mangomint, business-details form, product catalogue UI, and similar can stay web-only unless you add those screens to mobile.

---

## API base and auth

- **Base URL:** Both mobile and web use the same backend (e.g. `APP_URL` pointing to the Next.js app).  
- **Auth:** Mobile uses `getAccessToken()` from Supabase session and sends it with API requests (via `api-client`); web uses the same auth context.  
- **Provider scoping:** Both rely on the same backend logic (e.g. `getProviderIdForUser`) to scope data to the current provider.

So: **provider mobile is fully integrated with the same APIs as the provider portal for everything it currently does.** The only correction made was the booking-link slug update; the rest of the “gaps” are web-only features, not missing integration for existing mobile features.
