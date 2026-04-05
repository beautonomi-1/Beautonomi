# Release Scale Verification

Release-candidate verification checklist for provider/customer/web core journeys.

## Core Journey Matrix

### Provider App

- Login/session bootstrap
- Calendar day/week load
- Booking list and booking detail
- Dashboard widgets
- Settings shell navigation

### Customer App

- Search/provider discovery
- Book flow
- Checkout/payment redirect
- Booking detail
- Account bookings/settings

### Web/API

- Public booking hold/create
- Provider bookings and dashboard
- Payment webhook processing
- Portal token flows

## Required Verification Steps

1. Run static quality gates:
   - typecheck, lint, test
   - observability gate (`NEXT_PUBLIC_SENTRY_DSN` present)
2. Run release verification command:
   - `pnpm run prod:verify:release`
3. Run load suite:
   - auth burst
   - provider calendar reads
   - booking flow
   - webhook storm
   - mixed soak
4. Confirm all Tier-1 SLO gates pass.
5. Attach artifacts (logs, screenshots, k6 outputs) to release notes.

## Pass Criteria

- No blocking errors in core journey matrix.
- No Tier-1 gate failures from `docs/SCALE_SLO_GATES.md`.
- No unresolved P1/P2 alerts in verification window.
