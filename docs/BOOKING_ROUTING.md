# Booking routing (canonical `/booking`)

## Canonical entry

- **Web booking UI:** `/booking?slug={provider_slug}` plus optional deep-link query params.
- **Sign-in:** required before `POST /api/public/bookings`. Guests sign in after a slot hold via `BeautonomiGateModal`.

## Legacy redirects (permanent)

| Legacy URL | Destination |
|------------|-------------|
| `/book/{slug}?…` | `/booking?slug={slug}&…` (308) |
| `/book/l/{code}?…` | Client resolves link → `/booking?…` |
| `/book/continue?hold_id=` | `/booking?slug=&hold_id=&step=pay` |
| `/book/on-demand/*` | `/booking/on-demand/*` (308) |

## Deep-link parameters

`service` / `serviceId`, `services` (comma-separated), `staff`, `anyone`, `location`, `location_type` / `mode`, `date`, `addons`, `promo`, `gift_card`, `products`, `package` / `package_id`, `campaign_id`, `hold_id`, `reschedule_booking_id`, `embed=1`, `step` (`pay`, etc.).

Flow-key resets ignore: `step`, `auth_return`, `hold_id`, `embed`, `reschedule_booking_id`.

Redirect query building is centralized in `apps/web/src/lib/booking/legacy-book-redirects.ts` (unit-tested).

## Embed

Salon sites use `/booking?slug=&embed=1` (see `docs/EMBED.md`). Only URLs with `embed=1` receive `frame-ancestors *` CSP.
