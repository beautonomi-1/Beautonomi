# Manual QA — booking auth matrix (staging)

Run on `https://staging.beautonomi.com` after `seed-staging.mjs` and Mapbox ops (geocode not 5xx).

## Providers

| Row | Slug | Trigger auth |
|-----|------|----------------|
| A* / C* / D* / E1 | `e2e-test-provider-beautonomi` | After hold / at pay |
| B1 / B2 | `e2e-test-provider-auth-before-time` | Before calendar |
| E2 | `e2e-test-provider-at-home` | At-home validate + pay |

## Cases (sign-in method × timing)

- **A1** Email OTP at payment — gate → verify → pay → booking created.
- **A2** Email OTP at `before_time_selection` (B provider).
- **A3** Phone SMS OTP (same two timings).
- **A4** Google OAuth — lands `/auth/callback?next=` with `auth_return=1`, hold still valid.
- **A5** Apple OAuth — same as A4.
- **C*** Embed `embed=1` — OTP in iframe uses SPA `onAuthComplete` without broken session.
- **D1–D3** `/login?next=` and `/signup?next=` from gate footer — expect **booking return banner** + logo links back to booking; password sign-in returns to `next`.
- **E2** At-home address inside zone → validate OK → pay.
- **F1–F5** New user onboarding flags — after gate OAuth/login, `POST /api/public/bookings` succeeds without `/onboarding` redirect.

Record pass/fail and Vercel Preview SHA in your release notes.
