# Customer Features: Recurring Bookings, Returns/Refunds, Custom Requests, Waitlist, My Reviews

This document describes how these features work on **customer app** and **web**, their **API alignment**, and **improvements** to make them work fully.

---

## 1. Recurring Bookings

### Inner workings

- **Data:** Stored in `recurring_appointments` (customer_id, provider_id, frequency, start_date, end_date, preferred_time, location_type, location_id, metadata.services, is_active, etc.).
- **Create:** `POST /api/recurring-bookings` (auth required). Body: provider_id, services[], frequency (weekly|biweekly|monthly), start_date, preferred_time, location_type, etc. Inserts one row; **no** automatic first booking is created by the API.
- **List:** `GET /api/recurring-bookings` returns `{ recurring: RecurringAppointment[] }` with raw DB rows + `provider: { id, business_name, slug }`. No `service_name`, `next_date`, or `price` in the raw response.
- **Update (pause/resume):** `PATCH /api/recurring-bookings/[id]` with `{ is_active?, end_date? }`.
- **Cancel:** `DELETE /api/recurring-bookings/[id]` — sets `is_active: false` and `end_date` to today (soft cancel).
- **Cron:** `GET /api/cron/process-recurring-bookings` runs daily; for each active row it computes the next occurrence from `last_booking_date` or `start_date` + frequency; when that date is today it **creates a booking** row. It does **not** create payments or charge cards.

### App vs web

| Aspect | Customer app | Web (account-settings) |
|--------|--------------|-------------------------|
| List API | `GET /api/recurring-bookings` | Same |
| Response shape | Expects `service_name`, `provider_name`, `next_date`, `price`, `currency`, `status` | Uses `provider`, `metadata`, `frequency`, `start_date`, `end_date`, `is_active` |
| Pause/Resume | Not implemented (only Cancel) | PATCH with `is_active` |
| Create | Not in app (only “from booking detail page”) | Not on web account page; creation is elsewhere |

### Alignment and improvements

1. **Enrich GET response** so both app and web can show:
   - `service_name` (from first offering in metadata.services, or "Recurring appointment").
   - `provider_name` (from provider relation).
   - `next_date` (computed from start_date/last_booking_date + frequency).
   - `status`: `"active"` | `"paused"` | `"cancelled"` (from is_active and end_date).
   - `price` / `currency` (optional; from first service or null).
2. **Customer app:** Use enriched fields when present; fallback to provider + metadata so list is never empty/wrong.
3. **App: Add pause/resume** using `PATCH /api/recurring-bookings/[id]` with `is_active` (same as web).
4. **Creation:** Document or add entry points: “Set up recurring” from booking confirmation or booking detail (app + web) so users can create recurring from a completed booking.
5. **Payment:** Today the cron only creates the booking; payment is manual. Option: when recurring is created, optionally create Paystack subscription and create booking on charge.success (see `docs/customer-payments-and-recurring-bookings.md`).

---

## 2. Returns and Refunds

### Inner workings

- **Product returns:** Table `product_return_requests`. Customer creates via `POST /api/me/returns` (order_id, order_item_id?, reason, description?, image_urls?, quantity?). Only for orders in `delivered` or `ready_for_collection`, within return window (e.g. 14 days). Provider approves/rejects; status flow: pending → approved → item_received → refunded (or rejected / escalated / cancelled).
- **List:** `GET /api/me/returns` returns `{ returns: ReturnRequest[] }` with order and provider info.
- **Customer actions:** `PATCH /api/me/returns/[id]` with `action: "cancel"` (pending only) or `action: "escalate"` (rejected only).
- **Booking refunds:** Not customer self-service. Provider can refund via `POST /api/provider/bookings/[id]/refund`; admin via `POST /api/admin/bookings/[id]/refund`. Customer cancellation may trigger automatic refund per policy (see `docs/REFUNDS_AND_DISPUTES.md`).

### App vs web

| Aspect | Customer app | Web |
|--------|--------------|-----|
| List | `GET /api/me/returns` → my-returns.tsx | `GET /api/me/returns` → account-settings/returns |
| Response | Uses `data?.returns ?? data` | Uses `res.data.returns` |
| Cancel | PATCH `action: "cancel"` | Same |
| Escalate | PATCH `action: "escalate"` | Same |
| Create return | request-return.tsx → `POST /api/me/returns` | From order detail (account-settings/orders) |
| Deep link | account-settings → "Returns & refunds" → my-returns | account-settings/returns |

### Alignment and improvements

1. **Response shape:** API returns `{ returns: [] }`. App already unwraps `data?.returns`; web uses `res.data.returns`. Ensure both handle `successResponse({ returns })` (single unwrap) consistently.
2. **App:** “Request return” should be reachable from order detail (product-order-detail) with order_id; already have request-return.tsx. Ensure product-order-detail has a “Request return” button for delivered orders within the window.
3. **Web:** Ensure order detail page has “Request return” and links to `/account-settings/returns` for status.
4. **Booking refunds:** No customer “request refund” for bookings; keep as is (provider/admin issue). Document in help/settings that booking refunds are handled by the provider or support.

---

## 3. Custom Requests

### Inner workings

- **Data:** `custom_requests` (customer_id, provider_id, description, budget_min/max, location_type, preferred_start_at, duration_minutes, status, expires_at). Provider responds with `custom_offers` (price, duration, notes, expiration_at, payment_url, status: pending|paid|expired|withdrawn).
- **List:** `GET /api/me/custom-requests` — customer’s requests with offers (and provider, attachments).
- **Create:** `POST /api/me/custom-requests` (provider_id, description, location_type, budget_min/max, preferred_start_at, duration_minutes, image_urls?). Creates request and optionally a conversation message.
- **Accept & pay:** `POST /api/me/custom-offers/[offerId]/accept` returns `paymentUrl`; customer completes payment in browser.
- **Cancel request:** `POST /api/me/custom-requests/[id]/cancel` (only when no paid offer).

### App vs web

| Aspect | Customer app | Web |
|--------|--------------|-----|
| List | GET /api/me/custom-requests | Same |
| Create | custom-request-create.tsx (with provider_id param); upload via /api/me/custom-requests/upload | account-settings/custom-requests create flow |
| Accept & pay | POST custom-offers/[id]/accept → open payment URL in in-app browser | Same pattern |
| Cancel | POST custom-requests/[id]/cancel | Same |
| Response | Handles array or data/requests | Fetcher expects consistent shape |

### Alignment and improvements

1. **Cancel method:** App uses POST to `/api/me/custom-requests/[id]/cancel`. Ensure API route exists and accepts POST (it does). No change needed.
2. **Response unwrap:** App uses `raw?.data ?? raw?.requests ?? []`. API returns array or `{ data }`; ensure successResponse is consistent (return same shape as web custom-requests page expects).
3. **Web:** Ensure create flow supports same fields as app (provider, description, budget, location, images, preferred time).
4. **Edit request:** Neither app nor web supports editing a request after create; document as future improvement if needed.

---

## 4. Waitlist

### Inner workings

- **Data:** `waitlist_entries` (provider_id, customer_id, customer_name, customer_email, customer_phone, service_id?, staff_id?, preferred_date, preferred_time_start/end, status: waiting|notified|contacted|booked|cancelled).
- **Join (public):** `POST /api/public/waitlist` — no auth required. Checks provider’s `waitlist_online_enabled` and `waitlist_max_size`; creates entry. Used by web booking engine when no slots available.
- **Join (auth):** `POST /api/waitlist` (legacy?) — requires auth. Customer app may use public endpoint with optional auth (customer_id if logged in).
- **List (customer):** `GET /api/me/waitlist` returns enriched entries (provider_name, provider_slug, service_name, status: waiting|notified|expired, preferred_date, etc.). Status “expired” when slot date has passed.
- **Leave:** `DELETE /api/me/waitlist?id=<entry_id>`.

### App vs web

| Aspect | Customer app | Web |
|--------|--------------|-----|
| List | GET /api/me/waitlist | Same (if page exists in account-settings) |
| Response | Array or data.entries | Same |
| Leave | DELETE with ?id= | Same |
| Join | From provider booking flow (web has StepSchedule “Join waitlist”; app should use same public API when no slots) | StepSchedule → POST /api/public/waitlist |

### Alignment and improvements

1. **Customer app booking flow:** When the chosen date has no slots, show “Join waitlist” and call `POST /api/public/waitlist` with provider_id, customer name/email/phone (and service_id, staff_id, preferred_date, time range). Use same schema as web so backend stays single source of truth.
2. **List response:** API returns array directly. App uses `res.data` and handles `data?.entries ?? data`; ensure GET returns array or `{ entries: [] }` consistently (currently successResponse(enriched) returns array).
3. **Web:** Ensure account-settings has a “Waitlist” page that lists entries and allows “Leave” (link to same GET/DELETE APIs).

---

## 5. My Reviews

### Inner workings

- **Data:** `reviews` (booking_id, customer_id, provider_id, rating, comment, photos, is_verified). One review per booking.
- **List:** `GET /api/me/reviews` returns `{ reviews: Review[], total }` with bookings and providers relations.
- **Write/Edit:** Web has review write flow post-booking; app has review-write screen (bookingId, reviewId, rating, comment). Submit via POST to the appropriate review API (booking review or product review).

### App vs web

| Aspect | Customer app | Web |
|--------|--------------|-----|
| List | GET /api/me/reviews; uses data?.reviews ?? data | Same |
| Display | provider (or providers), booking, rating, comment, photos; Edit → review-write | Same |
| Edit | review-write.tsx with bookingId/reviewId | Same concept |

### Alignment and improvements

1. **Response shape:** API returns `{ reviews, total }`. App and web both use `reviews` array; ensure client unwraps once (res.data.reviews). Aligned.
2. **Provider relation name:** Supabase may return `providers` (FK relation). App handles both `r.providers` and `r.provider`. Keep that for compatibility.
3. **Review write API:** Ensure app’s review-write uses the same endpoint as web (e.g. POST/PATCH for booking reviews) and that booking_id is validated for the current user.

---

## Summary table

| Feature | Customer app | Web | API alignment | Main improvement |
|---------|-------------|-----|---------------|-------------------|
| Recurring | List, Cancel | List, Pause, Cancel | GET shape missing service_name, next_date, status | Enrich GET; add Pause in app; creation entry point |
| Returns/refunds | List, Cancel, Escalate, Create | Same | Aligned | Link “Request return” from order detail (app + web) |
| Custom requests | List, Create, Accept & pay, Cancel | Same | Aligned | Consistent response shape; document |
| Waitlist | List, Leave | List, Join (booking flow) | Aligned | App: add “Join waitlist” in book flow when no slots |
| My reviews | List, Edit | List, Edit | Aligned | None critical |

---

## Implementation checklist

- [x] **Recurring:** Enrich GET /api/recurring-bookings with service_name, provider_name, next_date, status, optional price; update app to use them and add Pause/Resume.
- [x] **Returns:** Add “Request return” from product order detail (app) and ensure web order detail links to returns.
- [x] **Custom requests:** Confirm cancel endpoint and response shape; document.
- [x] **Waitlist:** Add “Join waitlist” in customer app when no slots (POST /api/public/waitlist); ensure web waitlist page exists under account-settings.
- [x] **Reviews:** No API change; keep app’s provider/providers fallback.
