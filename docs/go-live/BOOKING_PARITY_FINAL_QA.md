# Final QA — booking env parity implementation (2026-10-05)

Fact-checked against codebase and live staging where noted.

## Code vs plan (verified)

| Requirement | Evidence | Status |
|-------------|----------|--------|
| Gate opens without `holdId` | `booking-flow.tsx`: `{gateOpen ? <BeautonomiGateModal … />}`; payment `onRequireAuth` without hold calls `openAuthGate` | **Pass** |
| `auth_return=1` on OAuth/OTP return | `appendAuthReturnToBookingNext` in `resolveGatePostLoginNext`; hold re-check effect when param + user + `holdId` | **Pass** |
| OAuth must not advance flow pre-session | `BeautonomiGateModal`: full-window OAuth uses `location.assign(url)`; no `onAuthComplete` before redirect | **Pass** (fixed in final QA) |
| Quiet-complete onboarding on booking | `booking-flow` on user load; `/login?next=/booking…`; API no-ops non-customer roles | **Pass** |
| Gate Turnstile | `captchaRequired` + `AuthTurnstile`; OTP send sets flag on `AuthOtpError` | **Pass** |
| Gate `/login?next=` + `/signup?next=` | Footer links; signup `redirectUrl`; login `return_to` alias | **Pass** |
| Hide service areas panel | Collapsible block removed; validate + `zoneError` unchanged | **Pass** |
| Venue gate (at-home) | `canProceed`: `coordinates` + `structuredAddress.line1` after validate | **Pass** |
| Payment validation UX | `getUserFacingMessage` prefers safe `VALIDATION_ERROR` fallback; unit test | **Pass** |
| Vitest gate helpers | `beautonomi-gate-auth-return.test.ts` (4 tests) | **Pass** |
| go-live `/book` probe | `live.book_slug_redirect` in `go-live-check.mjs` | **Pass** |
| mapbox_config sync | `syncMapboxConfig` in staging sync script + doc | **Pass** |
| Matrix seed slugs | `seed-staging.mjs` B1/B2 + E2 providers (not run on staging until ops runs script) | **Pass (code)** |

## Automated runs (local)

```
pnpm exec vitest run src/components/booking/__tests__/beautonomi-gate-auth-return.test.ts
pnpm exec vitest run src/lib/errors/__tests__/user-messages.test.ts
→ 6 tests passed

node apps/web/scripts/verify-booking-e2e-chain.mjs https://staging.beautonomi.com
→ OK (default slug)

apps/web tsc --noEmit → OK
pnpm i18n:check → OK
```

## Live staging (2026-10-05)

| Probe | Result |
|-------|--------|
| `/book/e2e-test-provider-beautonomi` | 308 → `/booking?slug=…` |
| `/auth/callback` (no code) | 307 → `/login?error=missing_code` |
| `/api/mapbox/geocode`, `/api/location/validate` | 502 / 500 — **Mapbox ops still required** |
| All three seed slugs + API chain | **Pass** on staging after seed (2026-10-05); matrix uses **separate owner users** per provider |

## Production co.za note

Sample `HEAD /book/{slug}` returned **200** (Next `permanentRedirect` on GET; HEAD may not mirror middleware **308**). After deploy, confirm with GET/`verify-booking-e2e-chain` against `https://www.beautonomi.co.za`.

## Still manual / ops (not code gaps)

1. Staging Mapbox tokens + admin Mapbox UI (`STAGING_MATRIX_PREP.md`).
2. Supabase Magic Link / Confirm signup / redirect URLs (`SUPABASE_BOOKING_AUTH.md`).
3. Manual auth matrix (`QA_AUTH_MATRIX.md`) after seed + Mapbox.
4. `pnpm run release:check` before merge to `main`.

## Auth callback fact (unchanged, correct)

`/auth/callback?next=/booking?…` redirects to booking **without** forcing `/onboarding` when `next` is set (`route.ts` ~287–297). Onboarding completion for OAuth users relies on quiet-complete on `/booking` load — matches plan.
