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
