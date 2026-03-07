# Customer mobile app booking flow – audit vs web & provider

## Summary

The customer app booking flow is **aligned with the shared APIs** (hold → checkout → consume) and works for the core journey. A few optional web features (addons, packages, category step, group booking) are not in the mobile flow by design or scope. Gaps that were addressed in this audit are documented below.

---

## Flow overview

| Step | Customer app | Web (Next.js) | API / provider |
|------|--------------|---------------|----------------|
| **Entry** | Partner profile → "Book" (slug, optional `service_id`, `duration_minutes`) | `/book/[providerSlug]` | Same public provider + services APIs |
| **Steps** | Service → Venue → Staff (if any) → Date → Time | Venue → Category → Services → Addons → Group → Staff → Schedule → Resources → Intake → Review | Same hold + availability APIs |
| **Hold** | `POST /api/public/booking-holds` (provider_id, staff_id, services, start_at, end_at, location_type, location_id, address) | Same | `booking_holds` table |
| **Checkout** | `GET /api/public/booking-holds/[id]` then `POST .../consume` with payment_method, payment_option, use_wallet, custom_field_values, provider_form_responses, **special_requests**, **promotion_code**, **addons** (optional) | Same + client_info for guests | Consume builds draft and `POST /api/public/bookings` |
| **Post-book** | Navigate to booking-detail or (tabs)/bookings | Confirmation page / account bookings | Same bookings API; provider app sees same bookings in calendar/list |

---

## What works end-to-end (customer app)

- **Service selection**: Single service or variant; pre-select from partner profile when `service_id` passed.
- **Venue**: At salon (single or **multiple locations** – user picks one) or at home with saved addresses / address picker / manual line1+city.
- **Staff**: Required when provider has staff; optional step when only one staff; "Book via website" when no staff (by design).
- **Date/time**: Week strip + quick chips (Today, Tomorrow, Next week); slots from `GET /api/public/providers/[slug]/availability`.
- **Hold creation**: Correct payload; at-home address includes line1, city, country, lat/lng when available.
- **Checkout**: Hold countdown, provider/services/location summary, **addons** (optional; fetched from `GET /api/public/addons?provider_id=&service_id=` and sent in consume), **platform custom fields**, **provider forms**, deposit vs full, card/cash, wallet, saved cards, **special requests**, **promo code**, cancellation policy, "Request now" (on-demand) when enabled.
- **Consume**: Sends payment_method, payment_option, use_wallet, save_card, custom_field_values, provider_form_responses, **special_requests**, **promotion_code**, **addons** (when selected); then Paystack (saved or new) or cash → navigate to booking-detail or bookings tab.
- **Booking detail**: View, cancel (`POST /api/me/bookings/[id]/cancel`), reschedule (navigate to book with slug + service_id + reschedule_booking_id), pay pending amount; realtime status updates.
- **On-demand**: Request now from checkout → waiting → result; provider app receives and can accept/decline.

---

## Alignments made in this audit

1. **Promo code & special requests**  
   Checkout now includes optional "Special requests" and "Promo code" fields and sends them in the consume payload so behaviour matches the web and the consume API.

2. **Multiple "At salon" locations**  
   When a provider has more than one location, the venue step shows each location as a selectable option instead of defaulting to the first only.

3. **Reschedule → cancel previous**  
   When the user reschedules (booking-detail → book with `reschedule_booking_id`), that id is passed to checkout. After the new booking is completed, the app asks whether to cancel the previous appointment; if yes, it calls the cancel API then navigates to the new booking.

4. **Addons**  
   Checkout fetches addons via `GET /api/public/addons?provider_id=&service_id=` (first offering from hold; `location_id` included when at salon). Optional "Add-ons" section with selectable addons; selected IDs and addon subtotal are sent in consume and included in the total/deposit.

---

## Deliberate / scope differences vs web

- **Addons**: Implemented on mobile in checkout (optional section); consume sends `addons: string[]` when the user selects addons. Web has a dedicated StepAddons; mobile uses the same API and consume payload.
- **Packages**: Web supports package selection; mobile is single-service (or one variant) only.
- **Category step**: Web can show categories first; mobile lists all services (categories still used for grouping in provider response).
- **Group booking**: Web has StepGroupParticipants when provider has `online_group_booking_enabled`; mobile does not (no `is_group_booking` / `group_participants` in consume).
- **Resources**: Web can collect resource_ids (rooms/equipment); mobile does not send resource_ids in hold or consume.
- **Staff "No preference"**: Web can allow null staff; mobile requires a selected staff (or redirects to website when no staff).
- **Reschedule**: Booking-detail "Reschedule" goes to book with `reschedule_booking_id`; that id is passed through to checkout. After the new booking is confirmed, the app prompts **"Would you like to cancel your previous appointment?"** with [Keep both] / [Cancel previous]. If the user taps "Cancel previous", the app calls `POST /api/me/bookings/{reschedule_booking_id}/cancel` then navigates to the new booking. The hold API does not accept reschedule_booking_id; this UX completes the "re-book then optionally cancel old" flow.

---

## Provider app alignment

- Provider app uses the same bookings (calendar, list, detail); bookings created from the customer app or web appear the same.
- On-demand requests from the customer app are received and can be accepted/declined in the provider app; flow is consistent.

---

## API surface used by customer app

- `GET /api/public/providers/[slug]` – provider detail and locations  
- `GET /api/public/providers/[slug]/services` – services (with categories/variants)  
- `GET /api/public/providers/[slug]/staff` – staff list  
- `GET /api/public/providers/[slug]/availability?date&service_id&staff_id&duration_minutes&location_id` – slots  
- `POST /api/public/booking-holds` – create hold  
- `GET /api/public/booking-holds/[id]` – load hold for checkout  
- `POST /api/public/booking-holds/[id]/consume` – create booking from hold  
- `GET /api/public/provider-forms?provider_id=...` – provider forms for checkout  
- `GET /api/public/addons?provider_id=...&service_id=...&location_id=...` – addons for checkout (optional)  
- `GET /api/custom-fields/definitions?entity_type=booking` – platform custom fields  
- `GET /api/me/wallet` – wallet balance  
- `GET /api/me/bookings/[id]` – booking detail  
- `POST /api/me/bookings/[id]/cancel` – cancel  
- `POST /api/me/on-demand/requests` – on-demand "Request now"

All of the above are shared with the web booking flow where applicable; the customer app uses a subset of the full web steps.

---

## Future improvements (optional)

- **Deep link after payment:** Implemented. The web checkout success page (`/checkout/success`) shows an "Open in app" link that uses the customer app scheme (`customer://`). The link targets: booking detail (when `booking_id` is present), custom requests (when `payment_type=custom_offer`), profile (when `payment_type=wallet_topup`), or the bookings tab otherwise. Tapping it opens the app to the relevant screen so the list refreshes in context.
- **Reschedule API:** If the backend adds a dedicated reschedule endpoint (e.g. replace existing booking with new slot), the mobile flow could call it instead of "re-book then cancel old."
