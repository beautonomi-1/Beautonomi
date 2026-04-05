# Provider Portal Performance Baseline

Use this checklist before and during provider portal performance work so each optimization has measurable evidence and does not weaken security behavior.

## Commands

From repo root:

```bash
pnpm run prod:provider:baseline
pnpm run prod:provider:route-metrics:audit
```

## Required baseline captures

- Provider critical API timings (p95/p99):
  - `GET /api/provider/dashboard`
  - `GET /api/provider/bookings`
  - `POST /api/provider/bookings`
  - `GET /api/me/role`
- Auth loading reliability:
  - spinner visible duration
  - timeout/fallback activation count
  - auth bootstrap success rate
- Provider navigation responsiveness:
  - dashboard -> calendar
  - dashboard -> bookings
  - bookings -> booking detail

## Browser matrix (minimum)

- iPad Safari (current)
- iPad Safari (older iPadOS if available)
- Chrome latest (desktop)
- Edge latest (desktop)
- Firefox latest (desktop)

## Security invariants to keep while optimizing

- Role checks remain server authoritative (`requireRoleInApi` / `requirePermission`).
- Tenant/provider scoping remains server resolved (`getProviderIdForUser`).
- No relaxation of rate-limit/idempotency protections.
- No public caching of user-private provider payloads.

## Evidence table template

| Metric | Baseline | After change | Delta | Pass/Fail |
|---|---:|---:|---:|---|
| `/api/provider/dashboard` p95 | | | | |
| `/api/provider/bookings` p95 | | | | |
| `/api/me/role` p95 | | | | |
| Auth stuck loader incidents | | | | |
| Provider nav median transition (ms) | | | | |

## Rollout gate

Do not progress to full rollout until all Tier-1 gates in `docs/SCALE_SLO_GATES.md` remain green for two consecutive runs/windows.
