# Provider Portal Browser Compatibility Matrix

Use this matrix to validate provider portal resilience on iPad/older browsers before widening rollout.

## Execute scan

```bash
pnpm run prod:provider:compat:scan
```

## Target matrix

| Device/Browser | Version band | Required outcome |
|---|---|---|
| iPad Safari | Latest stable | No stuck auth loader, navigation works, booking actions succeed |
| iPad Safari | Older supported iPadOS | No fatal JS errors, fallback copy actions show success/failure message |
| Chrome desktop | Latest stable | Baseline behavior |
| Edge desktop | Latest stable | Baseline behavior |
| Firefox desktop | Latest stable | Baseline behavior |

## Core provider journeys

- Login -> dashboard -> calendar.
- Dashboard -> bookings -> booking detail.
- Booking status transition (pending -> confirmed -> completed).
- Copy actions: booking links, express links, note content, phone copy.

## Validation checks

- Auth loading overlay clears within bounded timeout.
- `/api/me/role` and provider bootstrap calls do not remain pending indefinitely.
- Clipboard actions degrade gracefully when modern clipboard APIs are unavailable.
- No white screens or frozen interactions when tab is backgrounded/foregrounded.

## Evidence to capture

- Browser/OS version
- Route and action tested
- Result (pass/fail)
- Console/network snapshot for failures
- Mitigation/fix link if failed
