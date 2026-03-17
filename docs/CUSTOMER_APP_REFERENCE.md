# Customer mobile app – reference

**Scope:** Every screen and feature in `apps/customer`. Structure mapping, API usage, expected behavior, and gaps.

**Related:** [CUSTOMER_BOOKING_FLOW_AUDIT.md](./CUSTOMER_BOOKING_FLOW_AUDIT.md) (booking flow detail); [ACCOUNT_SETTINGS_AUDIT.md](./ACCOUNT_SETTINGS_AUDIT.md); [CUSTOMER_PROFILE_COMPLETION_AUDIT.md](./CUSTOMER_PROFILE_COMPLETION_AUDIT.md).

---

## 1. App structure summary

### 1.1 Route hierarchy

| Layer | Path | Description |
|-------|------|--------------|
| Root | `app/_layout.tsx` | Stack: index, (auth), auth, (app). Providers: Theme, Auth, SafeArea, etc. |
| Entry | `app/index.tsx` | Portal check (`GET /api/me/portal`). Redirect: no session → login; wrong portal → WrongAppScreen; ok → home. No profile check (unlike provider). |
| Auth | `(auth)/` | Stack: login, signup, forgot-password. headerShown: false. |
| Auth callback | `auth/callback.tsx` | OAuth/magic-link callback. |
| App | `(app)/` | Stack: (tabs), account-settings, and all other app screens (book, book-checkout, partner-profile, chat, booking-detail, cart, product-*, on-demand, etc.). headerShown: false by default. |
| Tabs | `(app)/(tabs)/` | Tabs: **home**, **explore**, **bookings**, **cart**, **chats**, **profile**. Hidden: search, saved. |
| Account settings | `(app)/account-settings/` | Stack: index + personal-info, profile-details, login-and-security, identity-verification, payments, wallet, taxes, addresses, bookings, notifications, preferences, privacy-and-sharing, referrals, loyalty, reviews, wishlists, messages, waitlist, recurring-bookings, custom-requests, membership, language. |

### 1.2 Screens by category

**Auth:** (auth)/login, signup, forgot-password; auth/callback.

**Tabs:** home, explore, bookings, cart, chats, profile; search, saved (hidden from tab bar).

**Booking flow:** partner-profile → book → book-checkout → booking-detail; (tabs)/bookings; account-settings/bookings, account-settings/recurring-bookings; on-demand/waiting, on-demand/result; custom-request-create, account-settings/custom-requests.

**Commerce / shop:** shop, (tabs)/cart, cart; product-detail, product-orders, product-order-detail, product-checkout; my-returns, request-return; gift-card-purchase.

**Messaging & social:** chat, (tabs)/chats; account-settings/messages; explore-post, (tabs)/explore; (tabs)/search.

**Account / settings:** account-settings/index and all sub-pages (see ACCOUNT_SETTINGS_AUDIT).

**Other:** notifications, booking-detail, review-write; help, about; more-providers/[section].

---

## 2. Screen-by-screen expected behavior and status

### Entry and auth

| Screen | Expected behavior | APIs / auth | Status |
|--------|-------------------|-------------|--------|
| index | Redirect: portal → home or login; wrong portal → WrongAppScreen | GET /api/me/portal | OK |
| login, signup, forgot-password | Sign-in; create account; reset email | Supabase auth | OK |
| auth/callback | OAuth/magic link; set session; redirect | Supabase session | OK |

**Gaps:** Optional: deep-link `return_to` after login.

### Tabs (main app)

| Screen | Expected behavior | APIs | Status |
|--------|-------------------|------|--------|
| home | Hero, categories, featured providers; navigate to explore/shop/profile/more-providers | GET /api/public/home | OK |
| explore | Masonry feed; like, save, open post; categories | GET /api/explore/posts, like/save events | OK |
| bookings | List upcoming/past; tap → booking-detail | GET /api/me/bookings | OK. Login gate. |
| cart (tab) | Opens stack cart screen | GET /api/me/cart, PATCH, DELETE | OK |
| chats | List conversations; tap → chat | GET /api/me/conversations | OK. Login gate. |
| profile | Avatar, name, verification, profile completion, loyalty, settings links, sign out | GET /api/me/profile-completion, loyalty, verification | OK |
| search, saved | Categories + search; saved → account-settings/wishlists | GET /api/public/categories, search | OK |

**Gaps:** Search: optional "no results" styling. Explore: pagination via useExploreFeed.

### Booking flow and stack (explore, chat, shop, other)

- **partner-profile:** Provider info, services, staff, reviews, products; Book, Chat, Wishlist, Custom request. OK.
- **book → book-checkout → booking-detail:** Hold, consume, addons, payment; reschedule, on-demand. OK. See CUSTOMER_BOOKING_FLOW_AUDIT.
- **on-demand/waiting, on-demand/result:** Poll request status; cancel; on accept → booking-detail. OK.
- **explore-post, chat, notifications:** Post detail (like, save, comment); messages (send, upload, mark read); notifications list and deep links. OK.
- **shop, product-detail, cart, product-checkout, product-orders, product-order-detail, request-return, my-returns:** Full cart and order flow. OK.
- **custom-request-create, gift-card-purchase, review-write, help, about, more-providers/[section]:** Wired. OK.

Account settings: see ACCOUNT_SETTINGS_AUDIT. Profile and profile completion: see CUSTOMER_PROFILE_COMPLETION_AUDIT.

---

## 3. API usage map

All customer API calls use `api` from `@/lib/api-client` (baseUrl = APP_URL). Auth: Bearer token; 401 → refresh then retry; second 401 → sign out. Some flows use direct `fetch` with APP_URL (config-bundle, mapbox, third-party-config).

### Auth & global

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| GET /api/me/portal | index | Portal check |
| GET /api/public/config-bundle | config-bundle | Config |
| GET /api/public/third-party-config | third-party-config | OneSignal etc. |
| POST /api/me/devices | PushNotificationsProvider | Register device |
| POST /api/me/safety/panic | SafetyPanicButton | Safety panic |

### Public / discovery

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| GET /api/public/home | useHomeData (home tab) | Home feed |
| GET /api/public/categories/global, /api/public/categories | home, search | Categories |
| GET /api/public/search | search tab | Search providers |
| GET /api/public/providers/[slug], .../services, .../staff, .../availability, .../reviews, .../membership-plans, .../products | partner-profile, book | Provider detail and booking |
| GET /api/public/products, /api/public/products/[id] | shop, product-detail | Product catalog |
| GET /api/public/gift-cards/purchase | gift-card-purchase | Gift card flow |

### Booking (see CUSTOMER_BOOKING_FLOW_AUDIT)

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| POST /api/public/booking-holds, GET/POST consume, GET provider-forms, custom-fields, addons | book, book-checkout | Hold and checkout |
| GET /api/me/wallet | book-checkout, product-checkout | Wallet balance |
| POST /api/me/on-demand/requests, GET .../[id], POST .../cancel | book-checkout, on-demand/waiting | On-demand |
| GET /api/me/bookings, GET .../[id], POST .../cancel | useBookings, booking-detail | Bookings |

### Profile & account

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| GET/PATCH /api/me/profile, POST /api/me/avatar, PUT /api/me/password | personal-info, login-and-security, preferences | Profile |
| GET /api/me/profile-completion, /api/me/verification, POST /api/me/verification | profile tab, identity-verification | Completion and verification |
| GET/PATCH /api/me/notification-preferences | account-settings/notifications | Notification prefs |
| GET/POST/PUT/DELETE /api/me/addresses | addresses, product-checkout, useAddresses | Addresses |
| GET/DELETE/PATCH /api/me/payment-methods | checkout, useSavedCards | Payment methods |
| GET /api/me/tax-info, /api/me/tax-documents | account-settings/taxes | Tax info |
| GET/PATCH /api/me/business-settings | account-settings/business | Business settings |
| GET /api/me/referrals, /api/me/loyalty-points|/loyalty, POST /api/me/loyalty/redeem | referrals, loyalty |
| GET /api/me/membership, POST cancel, subscribe | membership | Membership |
| GET /api/me/wishlists/providers, /api/me/recently-viewed, wishlists/check, wishlists/toggle | wishlists, partner-profile | Wishlists |

### Messaging & conversations

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| GET /api/me/conversations, POST create, POST [id]/read | chats, chat | Conversations |
| GET /api/me/messages, POST /api/me/messages, POST messages/upload | chat | Messages |

### Custom requests, cart & orders

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| GET/POST /api/me/custom-requests, POST upload, POST custom-offers/[id]/accept, POST [id]/cancel | custom-request-create, account-settings/custom-requests | Custom requests |
| GET/POST/PATCH/DELETE /api/me/cart | useCart, cart, product-detail | Cart |
| GET /api/me/orders, GET .../[id], POST /api/me/orders | useProductOrders, product-checkout | Orders |
| GET /api/me/returns, PATCH [id], POST /api/me/returns | my-returns, request-return | Returns |

### Other

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| GET /api/me/notifications, POST [id]/read, mark-all-read | notifications | Notifications |
| GET /api/me/waitlist, DELETE /api/me/waitlist | account-settings/waitlist | Waitlist |
| POST /api/mapbox/geocode, reverse-geocode (fetch) | AddressPicker, useAddresses | Address search |

---

## 4. Data correctness & response shape

- **api** client returns `{ data: json?.data ?? json, error }`. Backend `{ data: X }` → `res.data === X`.
- Many screens handle both array and `{ data: array }`.
- **Staff:** book and partner-profile unwrap `StaffMember[]` or `{ data: StaffMember[] }`. Backend should return array or `{ data: [] }`; both handled.
- **Wishlists, notifications:** Flexible shape handling. See CUSTOMER_BOOKING_FLOW_AUDIT for hold/checkout response shape.

---

## 5. Functionality by area

- **Entry & auth:** Portal check, profile-completion optional; login/signup/forgot-password. OK.
- **Home & discovery:** useHomeData, useExploreFeed, search, partner profile. OK.
- **Booking flow:** book → book-checkout → booking-detail; bookings list; on-demand. OK.
- **Custom requests, cart & commerce, messaging, account settings:** All use correct /api/me/* endpoints. OK.
- **Mapbox/address:** AddressPicker uses fetch(APP_URL + /api/mapbox/geocode) and reverse-geocode. OK.

---

## 6. Cross-cutting checks

| Area | Status |
|------|--------|
| Back button | All headed stack screens have header back. OK. |
| Tab bar visibility | Hidden on stack screens. OK. |
| Auth gates | Bookings, chats, cart checkout, explore save/like, custom-requests redirect or prompt login. OK. |
| Error handling | getApiErrorMessage() used; ScreenFrame or local error state; retry where applicable. OK. |
| Pull-to-refresh, loading states | Where lists exist. OK. |
| Deep links | customer:// from web; Singular links; Expo Router handles scheme. OK. |

---

## 7. Known gaps and improvements

1. **Search:** Refine "no results" copy; optional filters to match web.
2. **Booking:** Reschedule API if backend adds one; deep link from web done.
3. **Notifications:** Tap to open linked entity — verify payload id types and routes.
4. **Review-write:** Ensure bookingId and optional reviewId match API (PATCH vs POST).
5. **Offline:** No offline queue; failed requests show error and retry. Optional: cache last payload for key lists (useBookings, useCart implemented).
6. **Profile completion:** Phone edit, identity verification, emergency contact — implemented; see CUSTOMER_PROFILE_COMPLETION_AUDIT.

---

## 8. Summary

- **Structure:** Mapped; auth → app → tabs + account-settings + stack screens.
- **APIs:** All customer screens use `api` (APP_URL) or fetch(APP_URL + path). Endpoints align with web (public + me).
- **Functionality:** Entry, discovery, booking, custom requests, cart, orders, messaging, account settings are wired and correct.
- **Related:** [CUSTOMER_BOOKING_FLOW_AUDIT.md](./CUSTOMER_BOOKING_FLOW_AUDIT.md), [ACCOUNT_SETTINGS_AUDIT.md](./ACCOUNT_SETTINGS_AUDIT.md), [CUSTOMER_PROFILE_COMPLETION_AUDIT.md](./CUSTOMER_PROFILE_COMPLETION_AUDIT.md).
