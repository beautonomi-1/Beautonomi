# Customer app ↔ Provider app booking flow alignment

Bookings created in the **customer app** (via public booking-holds or on-demand) appear in the **provider app** and can be managed end-to-end.

## Customer flow → APIs → Provider

| Step | Customer app | Web API | Provider app |
|------|--------------|---------|--------------|
| Reserve slot | Book screen: staff, slot, location (at salon / at home), address | `POST /api/public/booking-holds` | — |
| Complete booking | Checkout: payment, add-ons, tip, forms | `POST /api/public/booking-holds/:id/consume` | Booking appears in list & calendar |
| Optional: request now | Checkout "Request now" | `POST /api/me/on-demand/requests` | Incoming request → Accept/Decline → opens created booking |
| View / manage | My Bookings, Booking detail | `GET /api/me/bookings`, `GET /api/me/bookings/:id` | Same booking: `GET /api/provider/bookings`, `GET /api/provider/bookings/:id` |
| At-home visit | Detail: arrival OTP, verify | `POST .../verify-arrival`, `.../resend-arrival-otp` | Detail: Get directions, Start journey, Arrive, Verify OTP, Resend OTP |
| Pay / charges | Pay remaining, receive link | `POST .../pay-remaining`, payment link | Request payment, Send payment link, Additional charges, Mark paid |
| Cancel / reschedule | Cancel, reschedule | `POST .../cancel`, reschedule flows | Same in booking detail: status, reschedule |

## Data alignment

- **location_type** and **address** (at-home) are stored by consume and returned by `GET /api/provider/bookings` and `GET /api/provider/bookings/[id]`. Provider list shows "At home" for at-home bookings; detail shows address and at-home actions.
- Status, amounts, services, customer info, and audit log are shared; customer and provider see the same booking record.

## Calendar ghost holds (stays in sync with customer checkout)

- The provider **mobile calendar** and **web provider calendar** load holds via `GET /api/provider/calendar/booking-holds`. That route returns rows with **`hold_status` in `active` or `consuming`** (not expired). **`consuming`** means the customer has started checkout after the atomic claim — the slot still blocks double-booking until payment completes or the hold expires.
- Each segment exposes **`reason`**: **Booking hold** vs **Booking in progress (checkout)**. The native calendar maps `reason` to the overlay title so providers can tell tentative reserve vs payment-in-progress.
- **`GET /api/provider/bookings/available-slots`** (used for **custom offers** and slot picking) uses the same underlying availability pipeline as public booking, including blocking time covered by **active** and **consuming** holds, so provider-created offers cannot steal a slot a customer is holding or checking out.

## Ecommerce (products / POS / orders)

- Product catalog, orders, inventory, and POS/Yoco flows use provider commerce APIs (`/api/provider/products`, orders, etc.). They do **not** read `booking_holds`. Alignment with bookings is through **`bookings`** rows and realtime updates once a customer completes checkout — same as in the table above.
