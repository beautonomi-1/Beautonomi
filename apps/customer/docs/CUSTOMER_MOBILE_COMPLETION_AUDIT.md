# Customer mobile app — completion audit

**Scope:** `apps/customer` (Expo / React Native).  
**Method:** Static review of routes, account/booking/shop/explore flows, and every `/api/...` reference in app source.  
**Date:** 2026-04-13.

**Related:** [AUTH_VERIFICATION.md](./AUTH_VERIFICATION.md), [PRODUCTION_AUDIT.md](./PRODUCTION_AUDIT.md).

---

## Executive summary

| Area | Completion (qualitative) | Notes |
|------|---------------------------|--------|
| Auth & entry | **High** | `/api/me/portal` (customer vs provider), onboarding (`/api/me/onboarding/complete`), profile completion card (`/api/me/profile-completion`), referral attach on deep link (`/api/me/referrals/attach`). |
| Home & discovery | **High** | `GET /api/public/home`, categories, search (`/api/public/search`, suggestions), inline suggestions, global categories. |
| Booking journey | **Very high** | Full stack: public provider catalog, availability, holds, waitlist, location validation, checkout consume, Paystack browser flow, reschedule/cancel paths, on-demand requests. |
| Account & settings | **Very high** | Large `account-settings/*` surface: profile, addresses, payments, wallet, loyalty, membership, waitlist, recurring, custom requests, taxes, privacy, notifications, identity verification, etc. |
| Shop & cart | **High** | **Shop** tab (`(tabs)/shop`) + cart; guest + authenticated cart (`/api/me/cart`), product catalog (`/api/public/products`), checkout with Paystack init, orders, returns (`my-returns` uses `/api/me/returns` in-app). |
| Explore & social | **High** | Feed (`/api/explore/posts`), post detail, comments, likes/saved, collections — aligned with provider Explore APIs. |
| Messaging | **High** | Conversations list, thread (`/api/me/messages`, create conversation, read receipts, upload). |
| Platform & safety | **High** | Account status/reactivation, delete/deactivate, retention sync, devices, analytics consent/identify, safety panic, maintenance gates. |

**Overall:** The customer app is a **primary client** for the Beautonomi customer API surface: booking and commerce flows are **deeply integrated**, not a thin shell.

---

## Architecture (API access)

- **Base URL:** `EXPO_PUBLIC_APP_URL` → `apps/web`; **Bearer** token from Supabase (`src/lib/api-client.ts`).
- **Patterns:** Direct `api.get/post/patch/...`, feature hooks (`useBookings`, `useCart`, `useExploreFeed`, `useHomeData`, `useProductCatalog`), and `useApi` where used (e.g. profile completion).
- **Non-`/api/me/` routes:** Centralized in `src/lib/customer-api-paths.ts` (`apiBookingReviewPath`, `API_RECURRING_BOOKINGS`, `apiRecurringBookingPath`) so new screens reuse the same paths and JSDoc points to the web handlers. The shared client still sends **Bearer** auth on every request.
- **Caching:** `api-response-cache` scopes `/api/me/*` by user (see `src/lib/api-response-cache.ts`).
- **Maps:** Mapbox **static** images use Mapbox HTTP APIs with token from third-party config; **geocoding** uses `POST /api/mapbox/geocode` and `POST /api/mapbox/reverse-geocode` (`src/hooks/useAddresses.ts`).

---

## Navigation & major UI surfaces

### Tab bar (`app/(app)/(tabs)/_layout.tsx`)

**Visible:** Home, Bookings, Cart, **Shop**, Chats, Profile.  
Cart badge uses `GET /api/me/cart` (authenticated) or guest cart from local storage.

**Hidden from tab bar (`href: null`):** Explore, Search, Saved — reachable from home top nav, shortcuts, or deep links.

### Stack routes (non-tab)

Not exhaustive; highlights:

- **Booking:** `book/index` (provider slug flow), `book/l/[linkSlug]` (express link resolve), `book/continue` → `book-checkout`, `book-checkout` (large checkout/consume flow).
- **Commerce:** `product-detail`, shop `product-checkout`, `my-returns`, `request-return`, `gift-card-purchase`.
- **Provider:** `partner-profile` (public provider page).
- **Post-booking:** `booking-detail`, `review-write`.
- **Explore:** `explore-post`, `explore-collection/[id]`.
- **Account:** `account-settings/*`, `onboarding`, `notifications`, `custom-request-create`, `on-demand/*`.

---

## API inventory (by prefix)

Dynamic segments are noted as `[id]` or described in parentheses.

### `/api/me/*` — authenticated customer

**Routing & onboarding:** `portal`, `role`, `onboarding/complete`, `profile-completion`, `referrals`, `referrals/attach`, `phone/verify`.

**Profile & preferences:** `profile`, `profile-data`, `profile-summary`, `beauty-preferences`, `preferences` (language screen), `avatar`, `password`, `privacy-settings`, `notification-preferences`, `tax-info`, `tax-documents`.

**Bookings:** `bookings` (list with filters), `bookings/[id]`, `bookings/[id]/cancel`, `bookings/[id]/cancel-preview`, `bookings/[id]/pay-remaining`, `bookings/[id]/calendar.ics` (URL), `bookings/[id]/resend-arrival-otp`, `bookings/[id]/verify-arrival`.

**Commerce:** `cart`, `cart/[itemId]`, `orders`, `orders/[id]`, `returns`, `returns/[id]`, `wallet`, `wallet/topup`, `payment-methods`, `payment-methods/[id]` (PATCH default), `payment-methods/initialize-verification`, `gift-cards`.

**Wishlists & discovery:** `wishlists/check`, `wishlists/toggle`, `wishlists/providers`, `wishlists/products`, `recently-viewed`.

**Messaging:** `conversations`, `conversations/create`, `conversations/[id]/read`, `messages` (list), `messages` POST, `messages/upload`.

**Custom requests / offers:** `custom-requests`, `custom-requests/upload`, `custom-requests/[id]/cancel`. **Custom-offer payment (canonical):** `GET /api/me/custom-offers/[id]` (includes `provider_deposit`), `GET /api/me/custom-offers/[id]/quote`, `POST /api/me/custom-offers/[id]/pay` (same handler as `POST .../accept`). Customer **Chat** and **Custom requests** both route pay actions to `(app)/custom-offer-checkout`, which uses `WebBrowser.openAuthSessionAsync`, optional `callback_url` to `custom-offer-paystack`, then Bearer `GET /api/paystack/verify` and polling — not the generic in-app WebView — so completion does not rely on cookie-authenticated fetches on `/checkout/success`.

**Loyalty & membership:** `loyalty-points`, `loyalty` (fallback), `loyalty/redeem`, `membership`, `membership/cancel`, `membership/subscribe`.

**Waitlist & on-demand:** `waitlist`, `on-demand/requests`, `on-demand/requests/[id]`, `on-demand/requests/[id]/cancel` — plus `POST /api/me/on-demand/requests` from checkout for new requests.

**Reviews:** `reviews` (list), `reviews?booking_id=` (in review-write).

**Notifications:** `notifications`, `notifications?unread_only=true`, `notifications/[id]/read`, `notifications/mark-all-read`, lightweight poll `notifications?limit=1` (badge context).

**Account lifecycle:** `account-status`, `reactivate-account`, `delete-account`, `deactivate`, `verification` (+ `sumsub/token` query), `retention/sync-on-login`.

**Analytics & devices:** `analytics/consent`, `analytics/identify`, `devices`.

**Safety:** `safety/panic`.

### `/api/public/*` — catalog, booking infra, config

**Home & config:** `home`, `config-bundle`, `third-party-config`, `app-version`, `maintenance`, `maintenance-notify`, `tenant-context` (market gate), `preference-options`, `ip-geolocation`.

**Providers (by slug):**  
`providers/[slug]`, `.../services`, `.../services/[oid]/addons`, `.../staff`, `.../online-booking-settings`, `.../packages`, `.../products`, `.../availability?...`, `.../reviews`, `.../membership-plans`, `.../group-booking-settings`.

**Search:** `categories`, `categories/global`, `search`, `search/suggestions`.

**Booking holds & flow:**  
`booking-holds` POST (create hold), `booking-holds/[id]`, `booking-holds/[id]/release`, `booking-holds/[id]/consume`,  
`waitlist` POST (join waitlist from book flow),  
`express-link/[slug]` (deep link to provider booking).

**Other public:**  
`products`, `products/[id]`, `provider-locations`, `products/shipping-config`, `platform-fees`,  
`provider-forms`, `addons`, `promotions/validate`, `gift-cards/validate`, `gift-cards/purchase`,  
`ads/event` (impression/engagement),  
`booking-holds/*` as above.  
Comment in checkout references server Paystack creation via **`POST /api/public/bookings`** in the web flow; mobile completes via **`consume`** on the hold and polls **`/api/me/bookings/[id]`** for status.

### `/api/explore/*` — Explore feed & collections

`explore/posts`, `explore/posts/mine` (provider app; customer uses feed), `explore/posts/[id]`, `explore/posts/[id]/comments`,  
`explore/saved`, `explore/events` (likes),  
`explore/collections`, `explore/collections/[id]`, `explore/collections/[id]/posts`,  
`explore/upload` (media).

### `/api/mapbox/*`

- `POST /api/mapbox/geocode`
- `POST /api/mapbox/reverse-geocode`

### Payments (server-mediated)

- `POST /api/payments/initialize` — `usePaystackPayment.ts`
- `POST /api/payments/charge-saved-card` — same hook
- `POST /api/paystack/initialize` — `shop/product-checkout.tsx` (product line checkout)

### Other top-level routes

- `POST /api/location/validate` — book flow (`book/index.tsx`)
- `GET /api/custom-fields/definitions?entity_type=booking` — `book-checkout.tsx`
- `PATCH` / `POST` **`/api/bookings/[bookingId]/review`** — `review-write.tsx` via `apiBookingReviewPath()` (not under `/api/me/`; server route shared with web)
- `POST /api/reports` — content/reporting from `partner-profile.tsx`
- **`/api/recurring-bookings`** and **`/api/recurring-bookings/[id]`** — `account-settings/recurring-bookings.tsx` via `customer-api-paths.ts`. Backend: `requireAuthInApi`; rows filtered by **`customer_id = user.id`** (`recurring_appointments`).

---

## Payload & typing patterns

- **Lists:** Query params for pagination, status tabs, `location_id` where applicable (`useBookings`, product orders, etc.).
- **Multipart:** Avatar, custom-request uploads, review attachments → `FormData` to `/api/me/avatar`, `/api/me/custom-requests/upload`, `/api/me/custom-requests/upload` (review).
- **Checkout consume:** JSON body to `booking-holds/[id]/consume` includes hold metadata, services, packages, client_info, optional `subscribe_recurring`, reschedule links — mirrors web `book/continue` behavior.
- **Wishlist toggle:** `{ item_type, item_id }` for providers/products.
- **Typed models:** `@/types/api` and inline interfaces on screens (e.g. booking detail, partner profile).

---

## Gaps & notes

1. **Hidden tabs:** Explore, Search, and Saved remain **off** the tab bar (home shortcuts / deep links). **Shop** is on the tab bar next to Cart.

2. **Returns list:** `my-returns.tsx` loads **`GET /api/me/returns`** in-app; order links use **`/(app)/product-orders`**, not the web account URL.

3. **Web parity:** Customer web flows live under `apps/web/src/app/book/**` and account pages; mobile implements **parallel routes** (`book/*`, `book-checkout`, `account-settings/*`). Edge marketing or SEO-only pages may have **no** mobile equivalent by design.

4. **Payment entry points:** Both **`/api/payments/*`** (shared Paystack hook) and **`/api/paystack/initialize`** (shop checkout) appear — maintainers should treat these as **intentionally separate** integration paths unless consolidating.

5. **Review API path — done:** Create/update uses **`POST` / `PATCH`** `apiBookingReviewPath(bookingId)` → **`/api/bookings/[id]/review`** (`review-write.tsx`). List/load context uses **`/api/me/bookings/[id]`** and **`/api/me/reviews?booking_id=`**. Bearer auth is automatic. If a review already exists for the booking but the screen was opened with only `bookingId`, the app loads the existing review and uses **PATCH** (avoids duplicate POST).

6. **Recurring bookings path — done:** **`API_RECURRING_BOOKINGS`** / **`apiRecurringBookingPath(id)`** match **`GET/PATCH/DELETE`** `apps/web` handlers; auth scope is **authenticated user**, ownership enforced on **`recurring_appointments.customer_id`**.

7. **Paystack / payment WebView:** Booking checkout and some flows use **`expo-web-browser`** or **`in-app-browser`** (WebView) for payment provider pages — required for hosted checkout, not a “missing native screen” for the payment step itself.

8. **Regenerating the exact path list:** Search for `` `/api/` `` and `"/api/` in `apps/customer` (`*.ts`, `*.tsx`), excluding `node_modules`.

---

## Completion verdict

- **Booking + checkout + provider discovery:** **Production-grade** surface area with holds, consume, waitlist, on-demand, group settings, forms, addons, promotions, gift cards, wallet, and reschedule/cancel flows.
- **Account, shop, explore, messaging:** **Broad** `/api/me/*`, `/api/public/*`, and `/api/explore/*` coverage consistent with a full consumer product.

For contract-level questions about a specific endpoint, inspect the corresponding `apps/web/src/app/api/**/route.ts` handler and shared types in `@beautonomi/types` / `@beautonomi/api`.
