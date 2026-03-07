# Account settings – audit (customer app)

Audit of all account settings pages and sub-pages: APIs used, behavior, and fixes applied.

---

## Index (Account)

- **Route:** `account-settings/index` (entry from profile).
- **Behavior:** Lists groups (Account, Bookings & Activity, Payments & Rewards, Preferences, Billing & Tax) with links to sub-pages or absolute routes (`/product-orders`, `/my-returns`). Share app, Help, About, Become a provider.
- **APIs:** None.
- **Navigation:** `handleNavigate(route)` – relative routes go to `account-settings/${route}`, absolute (e.g. `/product-orders`, `/my-returns`) go to `(app)` stack.
- **Status:** OK. Returns & refunds now has a dedicated screen (see below).

---

## Personal info

- **APIs:** `GET /api/me/profile`, `POST /api/me/avatar`, `PATCH /api/me/profile`.
- **Behavior:** Load profile, update name, phone, and emergency contact; upload avatar (then PATCH profile with `avatar_url`). PATCH sends `phone`, `emergency_contact` (optional name, phone, relationship).
- **Status:** OK. APIs exist and match.

---

## Identity verification

- **APIs:** `GET /api/me/verification`, `POST /api/me/verification` (FormData: file, document_type, country).
- **Behavior:** Screen `account-settings/identity-verification`. Load status (verified / pending); form: document type (license, passport, identity), country of issue, document photo (image picker); submit via POST. Shows "Identity verified" or "Under review" when pending.
- **Status:** OK. Linked from Account settings index and profile completion ("identity" deep link).

---

## Login & security

- **APIs:** `GET /api/me/profile`, `PUT /api/me/password`.
- **Behavior:** Show profile, biometric toggle (local), change password.
- **Fix applied:** Password API expects `{ currentPassword, newPassword }` and new password length ≥ 8. App was sending `{ password }` and validating ≥ 6. Now: added "Current password" field, send `currentPassword` and `newPassword`, validate new password ≥ 8 characters.

---

## Addresses

- **APIs:** `GET /api/me/addresses`, `POST /api/me/addresses`, `PUT /api/me/addresses/[id]`, `DELETE /api/me/addresses/[id]`.
- **Behavior:** List, add, edit, set default, delete. POST/PUT use correct payloads (no `undefined`; optional fields as `null` where required).
- **Status:** OK.

---

## Privacy & sharing

- **APIs:** `GET /api/me/privacy-settings`, `PATCH /api/me/privacy-settings`.
- **Behavior:** Load toggles (e.g. `email_notifications`, `sms_notifications`, `booking_reminders`), patch on change.
- **Status:** OK (API returns flat keys; app persists correctly).

---

## Bookings

- **API:** `GET /api/me/bookings?status=upcoming|past|cancelled`.
- **Behavior:** Tabs for upcoming/past/cancelled; tap row → `/(app)/booking-detail` with `id`.
- **Status:** OK.

---

## Recurring bookings

- **APIs:** `GET /api/recurring-bookings`, `DELETE /api/recurring-bookings/[id]`.
- **Behavior:** List recurring bookings, delete entry.
- **Status:** OK.

---

## Product orders

- **Route:** `/(app)/product-orders` (stack screen, not under account-settings).
- **API:** Uses orders/list API (from product-orders screen).
- **Status:** OK.

---

## Returns & refunds

- **Route:** `(app)/my-returns` (stack screen). Registered in `(app)/_layout.tsx`.
- **APIs:** `GET /api/me/returns`, `PATCH /api/me/returns/[id]` (body: `{ action: "cancel" | "escalate" }`).
- **Behavior:** Native list of return requests (order number, product, provider, reason, quantity, status, refund amount, date). Pull-to-refresh. **Pending:** "Cancel request" with confirmation → PATCH cancel. **Rejected:** "Escalate" → PATCH escalate. Empty state: "View my orders" (→ product-orders) and "Open in browser". Header "View orders" opens web orders; footer "Open full returns in browser" for creating new returns.
- **Status:** OK. Full native screen with list and actions; browser link for full flows.

---

## Custom requests

- **APIs:** `GET /api/me/custom-requests`, `POST /api/me/custom-offers/[id]/accept`, `POST /api/me/custom-requests/[id]/cancel`.
- **Behavior:** List requests with offers; Accept & Pay (opens payment URL); Cancel request (pending/offered, no paid offer). Refresh on app focus after payment.
- **Status:** OK (cancel and create conversation_id fixes done earlier).

---

## Waitlist

- **APIs:** `GET /api/me/waitlist`, `DELETE /api/me/waitlist?id=[entry_id]`.
- **Fix applied:** Back end only supports DELETE with query `?id=`. App was calling `DELETE /api/me/waitlist/${entry.id}` (path param), which 404’d. Now calls `DELETE /api/me/waitlist?id=${encodeURIComponent(entry.id)}`.

---

## Reviews

- **API:** `GET /api/me/reviews`.
- **Behavior:** List reviews; tap → `/(app)/partner-profile` or booking/review flow as applicable.
- **Status:** OK.

---

## Payments

- **APIs:** `GET /api/me/payment-methods`, `GET /api/me/gift-cards`, `DELETE /api/me/payment-methods` (body: `{ id }`), `POST /api/me/payment-methods/initialize-verification`.
- **Behavior:** List cards and gift cards; remove card (DELETE with body `{ id }`); add card opens Paystack via `authorization_url` from initialize-verification.
- **Status:** OK. DELETE and initialize-verification match API.

---

## Wallet

- **APIs:** `GET /api/me/wallet`, `POST /api/me/wallet/topup`.
- **Behavior:** Show balance, top-up (opens payment URL).
- **Status:** OK.

---

## Loyalty

- **APIs:** `GET /api/me/loyalty-points` (fallback `GET /api/me/loyalty`), `POST /api/me/loyalty/redeem`.
- **Behavior:** Points balance, worth (redemption_value / rate), history (transaction_type mapped), milestones, redeem.
- **Status:** OK (shape and mapping fixed earlier).

---

## Referrals

- **API:** `GET /api/me/referrals`.
- **Behavior:** Show referral code and copy/share. API resilient to missing handle (fallback from user id).
- **Status:** OK.

---

## Membership

- **APIs:** `GET /api/me/membership`, `POST /api/me/membership/cancel`.
- **Behavior:** Show plan/status, cancel membership.
- **Status:** OK.

---

## Notifications

- **APIs:** `GET /api/me/notification-preferences`, `PATCH /api/me/notification-preferences`.
- **Behavior:** Load/save email, SMS, booking reminders toggles (flat keys).
- **Status:** OK.

---

## Preferences (Language & region)

- **API:** `GET /api/me/profile`, `PATCH /api/me/profile` (language/region fields).
- **Behavior:** Load profile, update locale/currency/timezone.
- **Status:** OK.

---

## Wishlists (Saved & wishlists)

- **APIs:** `GET /api/me/wishlists/providers`, `GET /api/me/recently-viewed`, `GET /api/explore/saved`, `DELETE /api/explore/saved?post_id=`.
- **Behavior:** Tabs: Saved providers (+ recently viewed), Saved posts. Unsave post → DELETE with query.
- **Status:** OK. Response shape `data`, `next_cursor`, `has_more` matches GET saved.

---

## Messages

- **API:** `GET /api/me/conversations`.
- **Behavior:** List conversations; tap → chat (e.g. `/(app)/chat` with `id`).
- **Status:** OK.

---

## Taxes

- **APIs:** `GET /api/me/tax-info`, `GET /api/me/tax-documents`.
- **Behavior:** Show tax info and document list.
- **Status:** OK.

---

## Business

- **APIs:** `GET /api/me/business-settings`, `PATCH /api/me/business-settings`.
- **Behavior:** Load/patch business preferences (e.g. `user_profiles.business_preferences`).
- **Status:** OK.

---

## Language (standalone)

- **Route:** `account-settings/language`.
- **Behavior:** In-app language picker (e.g. `@beautonomi/i18n` + `changeLanguage`). No account API.
- **Status:** OK.

---

## Summary of fixes in this audit

| Page / area        | Issue | Fix |
|--------------------|-------|-----|
| **Waitlist**       | DELETE used path `/api/me/waitlist/${id}`; API expects query `?id=` | Call `api.delete(\`/api/me/waitlist?id=${encodeURIComponent(entry.id)}\`)` |
| **Login & security** | Password API expects `currentPassword` + `newPassword` (min 8 chars); app sent only `password` (min 6) | Added current password field; send `currentPassword`, `newPassword`; validate length ≥ 8 |
| **Returns & refunds** | Index linked to `/my-returns` but no screen | Added `(app)/my-returns.tsx`: native list (GET /api/me/returns), Cancel request (PATCH cancel), Escalate (PATCH escalate), empty state + "View my orders" / "Open in browser"; registered in app layout |

---

## API checklist (all account-settings related)

| API | Used by | Verified |
|-----|---------|----------|
| GET/PATCH /api/me/profile | personal-info, login-and-security, preferences | Yes |
| POST /api/me/avatar | personal-info | Yes |
| PUT /api/me/password | login-and-security | Yes (body fixed) |
| GET /api/me/verification, POST /api/me/verification | identity-verification | Yes |
| GET/POST/PUT/DELETE /api/me/addresses | addresses | Yes |
| GET/PATCH /api/me/privacy-settings | privacy-and-sharing | Yes |
| GET /api/me/bookings | bookings | Yes |
| GET/DELETE /api/recurring-bookings | recurring-bookings | Yes |
| GET /api/me/custom-requests, POST cancel, POST accept offer | custom-requests | Yes |
| GET /api/me/waitlist, DELETE ?id= | waitlist | Yes (DELETE fixed) |
| GET /api/me/reviews | reviews | Yes |
| GET /api/me/payment-methods, DELETE (body id), POST initialize-verification | payments | Yes |
| GET /api/me/gift-cards | payments | Yes |
| GET /api/me/wallet, POST topup | wallet | Yes |
| GET /api/me/loyalty-points, GET /api/me/loyalty, POST redeem | loyalty | Yes |
| GET /api/me/referrals | referrals | Yes |
| GET /api/me/membership, POST cancel | membership | Yes |
| GET/PATCH /api/me/notification-preferences | notifications | Yes |
| GET /api/me/conversations | messages | Yes |
| GET /api/me/tax-info, GET /api/me/tax-documents | taxes | Yes |
| GET/PATCH /api/me/business-settings | business | Yes |
| GET /api/me/wishlists/providers, GET /api/me/recently-viewed | wishlists | Yes |
| GET/DELETE /api/explore/saved | wishlists | Yes |
| GET /api/me/returns, PATCH /api/me/returns/[id] | my-returns | Yes |

All listed APIs exist under `apps/web/src/app/api` and match the usage above after the applied fixes.
