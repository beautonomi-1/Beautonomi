# Customer mobile app – full screen and feature audit

Audit of every screen and feature: expected behavior, APIs used, and identified gaps. Reference: existing docs (CUSTOMER_BOOKING_FLOW_AUDIT, ACCOUNT_SETTINGS_AUDIT, CUSTOMER_PROFILE_COMPLETION_AUDIT).

---

## 1. Entry and auth

| Screen | Expected behavior | APIs / auth | Status / gaps |
|--------|-------------------|-------------|----------------|
| **index** | Redirect: portal → home or login; wrong portal → WrongAppScreen | GET /api/me/portal | OK |
| **login** | Email/password sign-in; forgot password; sign up link | Supabase auth | OK |
| **signup** | Create account; redirect to home or login | Supabase auth | OK |
| **forgot-password** | Request reset email | Supabase resetPasswordForEmail | OK |
| **auth/callback** | Handle OAuth/magic link; set session; redirect | Supabase session | OK |

**Gaps:** None critical. Optional: deep-link `return_to` after login (e.g. back to booking-checkout).

---

## 2. Tabs (main app)

| Screen | Expected behavior | APIs | Status / gaps |
|--------|-------------------|------|----------------|
| **home** | Hero, categories, featured providers, CTA; navigate to explore/shop/profile/more-providers | GET /api/public/home | OK. Nav to explore, shop, profile, more-providers sections. |
| **explore** | Masonry feed; like, save, open post; categories, search | GET /api/explore/posts, POST/DELETE events (like), POST/DELETE saved | OK. Save icon fixed (moved outside Pressable). |
| **bookings** | List upcoming/past; tap → booking-detail; empty → home | GET /api/me/bookings | OK. Login gate. |
| **cart** (tab button) | Opens stack **cart** screen (not a tab content) | GET /api/me/cart, PATCH quantity, DELETE item | OK. Cart screen loads cart; tab shows badge. |
| **chats** | List conversations; tap → chat | GET /api/me/conversations | OK. Login gate. |
| **profile** | Avatar, name, verification, profile completion, loyalty, settings links, sign out | GET /api/me/profile-completion, loyalty, verification | OK. Completion refetch on focus; Account settings link on card. |
| **search** (hidden tab) | Categories + query search; results via ProviderCard → partner-profile | GET /api/public/categories, GET /api/public/search | OK. No explicit router in file; ProviderCard navigates. |
| **saved** (hidden tab) | Redirect to account-settings/wishlists | — | OK. |

**Gaps:** Search: no “no results” message styling if providers array empty (behavior OK). Explore: feed pagination/infinite scroll depends on useExploreFeed (cursor/next_cursor).

---

## 3. Stack screens (booking flow)

| Screen | Expected behavior | APIs | Status / gaps |
|--------|-------------------|------|----------------|
| **partner-profile** | Provider info, services, staff, reviews, products; Book, Chat, Wishlist, Report, Review, Gift card, Custom request | GET provider, services, reviews, staff, membership-plans, products; POST recently-viewed, wishlists/check, wishlists/toggle, reports, membership/subscribe | OK. |
| **book** | Service, venue, staff, date/time; create hold → book-checkout | GET services, staff, availability; POST booking-holds | OK. Multi-location, reschedule_booking_id. |
| **book-checkout** | Hold summary, addons, custom fields, provider forms, payment; consume → booking or payment URL | GET hold, provider-forms, custom-fields, addons, wallet; POST consume, cancel (reschedule), on-demand/requests | OK. Addons and deep-link after payment implemented. |
| **booking-detail** | View booking; cancel; reschedule; pay pending; print receipt (web) | GET /api/me/bookings/[id]; POST cancel | OK. |
| **on-demand/waiting** | Poll request status; cancel; on accept → booking-detail | GET on-demand/requests/[id]; POST cancel | OK. |
| **on-demand/result** | Success/declined UI; navigate to bookings or home | — | OK. |

**Gaps:** None. See CUSTOMER_BOOKING_FLOW_AUDIT for optional improvements (reschedule API, deep link from web).

---

## 4. Stack screens (explore, chat, notifications)

| Screen | Expected behavior | APIs | Status / gaps |
|--------|-------------------|------|----------------|
| **explore-post** | Post detail; like, save, comment; share; more options (Share, Copy link); Comment focuses input; keyboard dismiss on scroll | GET post, comments; like/save; POST comment | OK. More options, comment focus, KeyboardAvoidingView + dismiss on scroll. |
| **chat** | Conversation messages; send text; upload image; mark read | GET messages; POST conversations/create, conversations/[id]/read, messages, messages/upload | OK. |
| **notifications** | List notifications; mark read / mark all read; tap → chat or booking-detail | GET /api/me/notifications; POST [id]/read, mark-all-read | OK. |

**Gaps:** None critical.

---

## 5. Stack screens (shop and orders)

| Screen | Expected behavior | APIs | Status / gaps |
|--------|-------------------|------|----------------|
| **shop** | Product catalog; add to cart; open product-detail | GET /api/public/products; POST /api/me/cart (via useCart) | OK. |
| **product-detail** | Product info; add to cart | GET /api/public/products/[id]; POST /api/me/cart | OK. |
| **cart** | List items; update qty; remove; checkout → product-checkout | GET /api/me/cart; PATCH /api/me/cart/[itemId] { quantity }; DELETE /api/me/cart/[itemId] | OK. |
| **product-checkout** | Addresses, shipping, wallet, place order; Paystack or wallet | GET cart, addresses, locations, shipping-config, platform-fees, wallet; POST orders, paystack/initialize | OK. |
| **product-orders** | Order list; tap → order detail | GET /api/me/orders | OK. |
| **product-order-detail** | Order info; request return | GET /api/me/orders/[id]; nav to request-return | OK. |
| **request-return** | Create return request | POST /api/me/returns | OK. |
| **my-returns** | List returns; cancel (pending); escalate (rejected) | GET /api/me/returns; PATCH [id] (cancel/escalate) | OK. |

**Gaps:** None.

---

## 6. Stack screens (other)

| Screen | Expected behavior | APIs | Status / gaps |
|--------|-------------------|------|----------------|
| **custom-request-create** | Form; submit → create request; navigate to chat if conversation_id | POST /api/me/custom-requests | OK. |
| **gift-card-purchase** | Purchase flow; redirect to payment | POST /api/public/gift-cards/purchase | OK. |
| **review-write** | Submit review for booking | PATCH/POST /api/bookings/[bookingId]/review | OK. |
| **help** | WebView APP_URL/help | — | OK. |
| **about** | WebView APP_URL/about | — | OK. |
| **more-providers/[section]** | List providers (top-rated, nearest, etc.) from home data | GET /api/public/home (useHomeData) | OK. ProviderCard → partner-profile. |

**Gaps:** None.

---

## 7. Account settings (summary)

All account-settings screens are audited in **ACCOUNT_SETTINGS_AUDIT.md**. Summary:

- **Index:** Links to all sub-pages and absolute routes (product-orders, my-returns). OK.
- **Personal info:** GET/PATCH profile, POST avatar. OK.
- **Login & security:** GET profile, PUT password (currentPassword + newPassword, ≥8 chars). OK.
- **Addresses:** CRUD; DELETE with path id. OK.
- **Privacy & sharing:** GET/PATCH privacy-settings. OK.
- **Bookings:** GET bookings (tabs). OK.
- **Recurring bookings:** GET/DELETE recurring-bookings. OK.
- **Returns:** Handled by my-returns stack screen. OK.
- **Custom requests:** GET, accept offer, cancel request. OK.
- **Waitlist:** GET, DELETE with query `?id=`. Fixed. OK.
- **Reviews:** GET /api/me/reviews. OK.
- **Payments:** payment-methods, gift-cards, DELETE, initialize-verification. OK.
- **Wallet:** GET, topup. OK.
- **Loyalty:** GET loyalty(-points), POST redeem. OK.
- **Referrals:** GET referrals. OK.
- **Membership:** GET membership, POST cancel. OK.
- **Notifications (preferences):** GET/PATCH notification-preferences. OK.
- **Preferences (Language & region):** GET/PATCH profile (locale/currency/timezone). OK.
- **Wishlists:** wishlists/providers, recently-viewed, explore/saved; DELETE saved. OK.
- **Messages:** GET conversations (same as chats). OK.
- **Taxes:** GET tax-info, tax-documents. OK.
- **Business:** GET/PATCH business-settings. OK.
- **Language (standalone):** In-app language only; no API. OK.

---

## 8. Profile and profile completion

- **Profile tab:** Completion card, loyalty, verification; refetch on focus; “Account settings →” link. See **CUSTOMER_PROFILE_COMPLETION_AUDIT.md**.
- **Implemented (optional):** Phone editing, identity verification upload, and emergency contact in-app; checklist deep links and accessibility pass on main screens (see profile completion audit).

---

## 9. Cross-cutting checks

| Area | Expected | Status |
|------|----------|--------|
| **Back button** | All headed stack screens have header back (headerLeft fallback). | OK. Layout provides fallback; tabs with headerShown get back. |
| **Tab bar visibility** | Hidden on stack screens (book, book-checkout, etc.) so back is clear. | OK. |
| **Auth gates** | Bookings, chats, cart (checkout), explore save/like, custom-requests, etc. redirect or prompt login. | OK. |
| **Error handling** | Screens use ScreenFrame or local error state; retry where applicable. | OK. |
| **Pull-to-refresh** | Where lists exist (bookings, explore, cart, custom-requests, my-returns, etc.). | OK. |
| **Loading states** | Loading/refreshing/saving flags and indicators. | OK. |
| **Deep links** | customer:// from web success page; Singular links; Expo Router handles scheme. | OK. |

---

## 10. Known gaps and optional improvements

1. **Search:** Refine “no results” copy and optional filters to match web.
2. **Profile completion:** Phone edit, in-app identity verification, emergency contact – implemented (Personal info + identity-verification screen; see profile completion audit).
3. **Booking:** Reschedule API if backend adds one; deep link from web already done.
4. **Notifications (inbox):** Tap to open linked entity (booking, chat) – verify payload has correct id types and routes.
5. **Review-write:** Ensure bookingId and optional reviewId are passed and match API (PATCH update vs POST create).
6. **Accessibility:** Implemented. Main screens (profile, explore, book, book-checkout, booking-detail, account-settings, personal-info, identity-verification) have accessibilityLabel/accessibilityRole; key controls have labels/hints.
7. **Offline:** No offline queue; failed requests show error and retry. Acceptable for current scope.

---

## 11. API existence (web)

All customer app API paths listed above have been cross-referenced with `apps/web/src/app/api` in this audit and in ACCOUNT_SETTINGS_AUDIT. Endpoints used by the app exist and match (after fixes: waitlist DELETE query, password body, returns screen, profile completion refetch, explore save button, explore-post more options and keyboard).

---

## 12. Document index

- **CUSTOMER_BOOKING_FLOW_AUDIT.md** – Booking flow vs web, addons, deep link after payment.
- **ACCOUNT_SETTINGS_AUDIT.md** – Every account-settings page, APIs, fixes (waitlist, password, returns).
- **CUSTOMER_PROFILE_COMPLETION_AUDIT.md** – Profile completion API, checklist, where to complete each item, refetch on focus.
- **CUSTOMER_APP_FULL_AUDIT.md** (this file) – Every screen and feature, expected behavior, gaps.
