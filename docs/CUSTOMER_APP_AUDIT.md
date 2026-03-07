# Customer mobile app – full audit

**Scope:** Every screen and feature in `apps/customer`. Structure mapping, API usage, and alignment with web/backend.

**Date:** 2025-03-07

**Related:** Booking flow is covered in [CUSTOMER_BOOKING_FLOW_AUDIT.md](./CUSTOMER_BOOKING_FLOW_AUDIT.md); this doc adds structure and full API map.

---

## 1. App structure summary

### 1.1 Route hierarchy

| Layer | Path | Description |
|-------|------|-------------|
| Root | `app/_layout.tsx` | Stack: index, (auth), auth, (app). Providers: Theme, Auth, SafeArea, etc. |
| Entry | `app/index.tsx` | Portal check (`GET /api/me/portal`). Redirect: no session → login; wrong portal → WrongAppScreen; ok → home. No profile check (unlike provider). |
| Auth | `(auth)/` | Stack: login, signup, forgot-password. headerShown: false. |
| Auth callback | `auth/callback.tsx` | OAuth/magic-link callback. |
| App | `(app)/` | Stack: (tabs), account-settings, and all other app screens (book, book-checkout, partner-profile, chat, booking-detail, cart, product-*, on-demand, etc.). headerShown: false by default. |
| Tabs | `(app)/(tabs)/` | Tabs: **home**, **explore**, **bookings**, **cart**, **chats**, **profile**. Hidden: search, saved. |
| Account settings | `(app)/account-settings/` | Stack: index + personal-info, login-and-security, identity-verification, payments, wallet, taxes, addresses, bookings, notifications, preferences, privacy-and-sharing, referrals, loyalty, reviews, wishlists, messages, waitlist, recurring-bookings, custom-requests, membership, business, language. |

### 1.2 Screens by category

**Auth**  
- (auth)/login, signup, forgot-password  
- auth/callback

**Tabs**  
- home, explore, bookings, cart, chats, profile  
- search, saved (hidden from tab bar)

**Booking flow**  
- partner-profile (discovery) → book → book-checkout → booking-detail  
- (tabs)/bookings (list)  
- account-settings/bookings, account-settings/recurring-bookings  
- on-demand/waiting, on-demand/result  
- custom-request-create, account-settings/custom-requests

**Commerce / shop**  
- shop, (tabs)/cart, cart (full screen)  
- product-detail, product-orders, product-order-detail, product-checkout  
- my-returns, request-return  
- gift-card-purchase

**Messaging & social**  
- chat, (tabs)/chats  
- account-settings/messages  
- explore-post, (tabs)/explore  
- (tabs)/search

**Account / settings**  
- account-settings/index (hub)  
- personal-info, login-and-security, identity-verification  
- payments, wallet, taxes, addresses  
- bookings, notifications, preferences, privacy-and-sharing  
- referrals, loyalty, reviews, wishlists, messages, waitlist  
- recurring-bookings, custom-requests, membership, business, language

**Other**  
- notifications, booking-detail, review-write  
- help, about  
- more-providers/[section]

---

## 2. API usage map

All customer API calls use `api` from `@/lib/api-client` (baseUrl = APP_URL). Auth: Bearer token; 401 → refresh then retry; second 401 → sign out. Some flows use direct `fetch` with APP_URL (e.g. config-bundle, mapbox geocode/reverse-geocode, third-party-config).

### 2.1 Auth & global

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/me/portal` | index | Portal check (customer vs provider vs admin) |
| `GET /api/public/config-bundle` | config-bundle | Config (fetch with APP_URL) |
| `GET /api/public/third-party-config` | third-party-config | OneSignal etc. (fetch with APP_URL) |
| `POST /api/me/devices` | PushNotificationsProvider | Register device (OneSignal) |
| `POST /api/me/safety/panic` | SafetyPanicButton | Safety panic |

### 2.2 Public / discovery

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/public/home` | useHomeData (home tab) | Home feed / featured |
| `GET /api/public/categories/global` | useGlobalCategories | Global categories |
| `GET /api/public/categories` | search tab | Categories for search |
| `GET /api/public/search` | search tab | Search providers/services |
| `GET /api/public/providers/[slug]` | partner-profile, book | Provider detail |
| `GET /api/public/providers/[slug]/services` | partner-profile, book | Provider services |
| `GET /api/public/providers/[slug]/staff` | partner-profile, book | Staff list |
| `GET /api/public/providers/[slug]/availability` | book | Slots |
| `GET /api/public/providers/[slug]/reviews` | partner-profile | Reviews |
| `GET /api/public/providers/[slug]/membership-plans` | partner-profile | Membership plans |
| `GET /api/public/providers/[slug]/products` | partner-profile | Provider products |
| `GET /api/public/products` | useProductCatalog (shop) | Product catalog |
| `GET /api/public/products/[id]` | product-detail | Product detail |
| `GET /api/public/gift-cards/purchase` | gift-card-purchase | Gift card purchase flow |

### 2.3 Booking (see CUSTOMER_BOOKING_FLOW_AUDIT.md)

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `POST /api/public/booking-holds` | book | Create hold |
| `GET /api/public/booking-holds/[id]` | book-checkout | Load hold |
| `POST /api/public/booking-holds/[id]/consume` | book-checkout | Create booking from hold |
| `GET /api/public/provider-forms` | book-checkout | Provider forms |
| `GET /api/custom-fields/definitions` | book-checkout | Platform custom fields |
| `GET /api/public/addons` | book-checkout | Addons (optional) |
| `GET /api/me/wallet` | book-checkout, product-checkout | Wallet balance |
| `POST /api/me/on-demand/requests` | book-checkout | On-demand "Request now" |
| `GET /api/me/on-demand/requests/[id]` | on-demand/waiting | On-demand status |
| `POST /api/me/on-demand/requests/[id]/cancel` | on-demand/waiting | Cancel on-demand |
| `GET /api/me/bookings` | useBookings, bookings tab, account-settings/bookings | List bookings |
| `GET /api/me/bookings/[id]` | booking-detail | Booking detail |
| `POST /api/me/bookings/[id]/cancel` | booking-detail, book-checkout (reschedule flow) | Cancel booking |

### 2.4 Profile & account

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/me/profile` | personal-info, login-and-security, preferences | Profile |
| `PATCH /api/me/profile` | personal-info, preferences | Update profile |
| `POST /api/me/avatar` | personal-info | Avatar upload |
| `PUT /api/me/password` | login-and-security | Change password |
| `GET /api/me/profile-completion` | profile tab | Completion status |
| `GET /api/me/verification` | identity-verification, profile tab | Verification status |
| `POST /api/me/verification` | identity-verification | Submit verification |
| `GET /api/me/notification-preferences` | account-settings/notifications | Notification prefs |
| `PATCH /api/me/notification-preferences` | account-settings/notifications | Update prefs |
| `GET /api/me/addresses` | addresses, product-checkout, useAddresses | Saved addresses |
| `POST /api/me/addresses` | addresses | Create address |
| `PUT /api/me/addresses/[id]` | addresses | Update address |
| `DELETE /api/me/addresses/[id]` | addresses | Delete address |
| `GET /api/me/payment-methods` | useSavedCards (checkout) | Saved cards |
| `DELETE /api/me/payment-methods/[id]` | useSavedCards | Delete card |
| `PATCH /api/me/payment-methods/[id]` | book-checkout | Set default card |
| `GET /api/me/tax-info`, `/api/me/tax-documents` | account-settings/taxes | Tax info |
| `GET /api/me/business-settings` | account-settings/business | Business settings |
| `PATCH /api/me/business-settings` | account-settings/business | Update business |
| `GET /api/me/referrals` | account-settings/referrals | Referrals |
| `GET /api/me/loyalty-points` or `/api/me/loyalty` | account-settings/loyalty, profile tab | Loyalty |
| `POST /api/me/loyalty/redeem` | account-settings/loyalty | Redeem points |
| `GET /api/me/membership` | account-settings/membership | Membership |
| `POST /api/me/membership/cancel` | account-settings/membership | Cancel membership |
| `GET /api/me/wishlists/providers`, `/api/me/recently-viewed` | account-settings/wishlists | Wishlists |
| `POST /api/me/wishlists/check`, `/api/me/wishlists/toggle` | partner-profile | Wishlist check/toggle |
| `POST /api/me/recently-viewed` | partner-profile | Track recently viewed |
| `POST /api/me/membership/subscribe` | partner-profile | Subscribe to membership |

### 2.5 Messaging & conversations

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/me/conversations` | chats tab, account-settings/messages | List conversations |
| `POST /api/me/conversations/create` | chat | Create conversation |
| `POST /api/me/conversations/[id]/read` | chat | Mark read |
| `GET /api/me/messages` | chat | Messages for conversation |
| `POST /api/me/messages` | chat | Send message |
| `POST /api/me/messages/upload` | chat | Upload attachment |

### 2.6 Custom requests

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/me/custom-requests` | account-settings/custom-requests | List requests |
| `POST /api/me/custom-requests` | custom-request-create | Create request |
| `POST /api/me/custom-requests/upload` | custom-request-create, review-write | Upload attachment |
| `POST /api/me/custom-offers/[id]/accept` | account-settings/custom-requests | Accept offer |
| `POST /api/me/custom-requests/[id]/cancel` | account-settings/custom-requests | Cancel request |

### 2.7 Cart & orders

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/me/cart` | useCart, cart | Cart items |
| `POST /api/me/cart` | useCart, product-detail | Add to cart |
| `PATCH /api/me/cart/[id]` | useCart, cart | Update quantity |
| `DELETE /api/me/cart/[id]` | useCart | Remove item |
| `DELETE /api/me/cart` | useCart | Clear cart |
| `GET /api/me/orders` | useProductOrders | Orders list |
| `GET /api/me/orders/[id]` | useProductOrders | Order detail |
| `POST /api/me/orders` | product-checkout | Create order |
| `GET /api/me/returns` | my-returns | Returns list |
| `PATCH /api/me/returns/[id]` | my-returns | Cancel/escalate return |
| `POST /api/me/returns` | request-return | Create return |

### 2.8 Other

| Endpoint | Used in | Purpose |
|----------|---------|---------|
| `GET /api/me/notifications` | notifications | Notifications list |
| `POST /api/me/notifications/[id]/read` | notifications | Mark read |
| `POST /api/me/notifications/mark-all-read` | notifications | Mark all read |
| `GET /api/me/waitlist` | account-settings/waitlist | Waitlist entries |
| `DELETE /api/me/waitlist` | account-settings/waitlist | Remove from waitlist |
| `GET /api/public/providers/[id]/locations` | product-checkout | Provider locations (shipping) |
| `GET /api/public/products/shipping-config` | product-checkout | Shipping config |
| `GET /api/public/platform-fees` | product-checkout | Platform fees |
| `POST /api/mapbox/geocode` (via fetch) | AddressPicker, useAddresses.searchAddress | Address search (APP_URL + path) |
| `POST /api/mapbox/reverse-geocode` (via fetch) | AddressPicker | Reverse geocode (APP_URL + path) |

---

## 3. Data correctness & response shape

### 3.1 Patterns

- **api** client (createApiClient from @beautonomi/api) returns `{ data: json?.data ?? json, error }`. So backend `{ data: X }` → `res.data === X`.
- Many screens handle both array and `{ data: array }`, e.g. `Array.isArray(raw) ? raw : (raw as any)?.data ?? []`.
- **useAddresses** and **searchAddress**: useAddresses uses api.get for addresses (unwraps correctly). searchAddress uses raw fetch to APP_URL + /api/mapbox/geocode (no Bearer; geocode is typically public or key server-side). Response: `json.data ?? json` then array check.

### 3.2 Booking flow

- Aligned with [CUSTOMER_BOOKING_FLOW_AUDIT.md](./CUSTOMER_BOOKING_FLOW_AUDIT.md): hold → checkout → consume; special_requests, promotion_code, addons; multiple locations; reschedule → cancel previous.

### 3.3 Potential response-shape notes

- **Staff:** book and partner-profile use `StaffMember[] \| { data: StaffMember[] }` and unwrap (e.g. `Array.isArray(staffData) ? staffData : (staffData as any)?.data ?? []`). Backend should return array or `{ data: [] }`; both are handled.
- **Wishlists/recently-viewed:** account-settings/wishlists uses `/api/me/wishlists/providers` and `/api/me/recently-viewed`; types are `any`; ensure backend shape matches UI expectations.
- **Notifications:** Handles `notifications` or `data.notifications`; flexible.

---

## 4. Functionality by area

### 4.1 Entry & auth

- **index:** Portal check, then profile-completion check. Redirects: no session → login; wrong portal → WrongAppScreen; required profile incomplete → account-settings/personal-info; else → home. On profile-completion timeout/error, proceed to home. **OK.**
- **Login/signup/forgot-password:** Supabase auth; forgot-password uses APP_URL for reset link. **OK.**

### 4.2 Home & discovery

- **Home:** useHomeData → GET /api/public/home. **OK.**
- **Explore:** Feed; useExploreFeed. **OK.**
- **Search:** Categories + GET /api/public/search. **OK.**
- **Partner profile:** Provider + services + staff + reviews + membership + products; wishlist toggle; recently viewed; book CTA. **OK.**

### 4.3 Booking flow

- **book → book-checkout → booking-detail:** See [CUSTOMER_BOOKING_FLOW_AUDIT.md](./CUSTOMER_BOOKING_FLOW_AUDIT.md). Hold, consume, addons, special requests, promo code, multiple locations, reschedule, on-demand. **OK.**
- **Bookings list:** useBookings → /api/me/bookings. **OK.**
- **On-demand:** waiting → GET request status; cancel. **OK.**

### 4.4 Custom requests

- **Create:** POST /api/me/custom-requests; upload for attachments. **OK.**
- **List & accept/cancel:** GET /api/me/custom-requests; accept offer; cancel. **OK.**

### 4.5 Cart & commerce

- **Cart:** GET/POST/PATCH/DELETE /api/me/cart. **OK.**
- **Product detail:** GET /api/public/products/[id]; add to cart. **OK.**
- **Product checkout:** Addresses, provider locations, shipping config, platform fees, wallet; POST /api/me/orders. **OK.**
- **Orders & returns:** GET orders, GET order detail, POST return, PATCH return. **OK.**

### 4.6 Messaging

- **Conversations:** GET /api/me/conversations; create; messages; read; upload. **OK.**

### 4.7 Account settings

- **Profile, password, verification, notifications, addresses, payments, wallet, taxes, business, referrals, loyalty, membership, wishlists, waitlist, custom-requests, recurring-bookings, etc.:** All use correct /api/me/* endpoints. **OK.**

### 4.8 Mapbox / address

- **AddressPicker:** fetch(APP_URL + /api/mapbox/geocode) and reverse-geocode. No Bearer (geocode is server-side or public). **OK.**

---

## 5. Issues & recommendations

### 5.1 No critical bugs found

- No relative `Linking.openURL` that would fail on native (grep found none).
- API base: all api.* calls use APP_URL via api-client; fetch uses APP_URL for config, third-party-config, mapbox. **OK.**

### 5.2 Optional improvements

| Item | Recommendation |
|------|----------------|
| **Profile completion** | **Done.** Index now calls GET /api/me/profile-completion after portal check; if any **required** item is incomplete (e.g. email not verified), user is redirected to account-settings/personal-info. On timeout or API error, user proceeds to home. |
| **Error handling** | **Done.** `getApiErrorMessage()` in `@/lib/api-error` used for consistent user-facing messages from API errors and caught exceptions. Used in: book, booking-detail, membership, product-checkout, useBookings, useCart, useProductOrders. |
| **Offline** | No offline cache for lists; consider caching last payload for key screens (optional). |

### 5.3 Booking flow

- Fully documented in [CUSTOMER_BOOKING_FLOW_AUDIT.md](./CUSTOMER_BOOKING_FLOW_AUDIT.md). Deep link after payment implemented; reschedule API remains backend-dependent.

---

## 6. Summary

- **Structure:** Mapped; auth → app → tabs + account-settings + stack screens. No orphan routes.
- **APIs:** All customer screens use `api` (APP_URL) or fetch(APP_URL + path) for public/config/mapbox. Endpoints align with web (public + me).
- **Data:** Response handling is consistent (array vs data unwrap). Staff, wishlists, notifications shapes handled or flexible.
- **Functionality:** Entry, discovery, booking, custom requests, cart, orders, messaging, account settings are wired and correct.
- **Related:** Booking flow details and addons/reschedule/deep-link are in [CUSTOMER_BOOKING_FLOW_AUDIT.md](./CUSTOMER_BOOKING_FLOW_AUDIT.md).

**Next steps (optional):** Consider offline caching for lists.
