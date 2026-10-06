# Enterprise auth checklist (web booking)

## Before merge to `main`

- [ ] `pnpm --filter web test` — booking return + auth rate-limit tests
- [ ] `pnpm run release:check`
- [ ] Staging: [`QA_AUTH_MATRIX.md`](./QA_AUTH_MATRIX.md) D1–D3 (login/signup booking banner + password)
- [ ] Upstash prod env documented in [`AUTH_RATE_LIMITS.md`](./AUTH_RATE_LIMITS.md)

## Config

- [ ] Turnstile (`TURNSTILE_SECRET_KEY` + public site key) on staging + prod
- [ ] Supabase Magic Link template shows `{{ .Token }}` — [`SUPABASE_BOOKING_AUTH.md`](./SUPABASE_BOOKING_AUTH.md)
- [ ] Mapbox staging/prod for at-home validate — [`STAGING_MATRIX_PREP.md`](./STAGING_MATRIX_PREP.md)

## Out of scope

- Web App Review demo OTP UI (customer app only)
- LoginModal redirect to `/login?next=` for booking

## Post-deploy

- [ ] `node apps/web/scripts/verify-booking-e2e-chain.mjs https://www.beautonomi.co.za`
- [ ] `node scripts/prod/go-live-check.mjs` on `.com` and `.co.za`
