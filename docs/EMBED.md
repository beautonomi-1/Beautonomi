# Salon embed contract

## Snippet

- Script: `/embed/booking-button.js`
- Iframe src: `/booking?slug={provider}&embed=1` (legacy `/book/{slug}?embed=1` redirects to the same target).

## postMessage (`source: beautonomi-booking-embed`)

- `ready` — iframe loaded
- `resize` — `{ height }` for host layout
- `auth_required` / `payment_redirect` — host should navigate top window to `url`
- `booked` — success; optional return to salon `return_url`

## Security

- Host script validates `event.origin` against the Beautonomi site origin.
- Booking pages without `embed=1` use `frame-ancestors 'self'`.
