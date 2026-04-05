# Provider Portal Canary Rollout

Use this runbook for safe rollout of provider portal performance changes.

## Preconditions

- `pnpm run prod:provider:baseline` completed and evidence recorded.
- `pnpm run prod:provider:route-metrics:audit` passed.
- `pnpm run prod:provider:compat:scan` reviewed against `docs/PROVIDER_PORTAL_BROWSER_MATRIX.md`.
- Observability env gate is green (`pnpm run prod:check:observability`).

## Canary stages

1. **Stage 0 (internal only)**  
   Enable for internal/provider test accounts.
2. **Stage 1 (5%)**  
   Small cohort for 24 hours.
3. **Stage 2 (25%)**  
   Expand only if all gates remain green.
4. **Stage 3 (50%)**  
   Hold and watch burn-rate + booking failures.
5. **Stage 4 (100%)**  
   Full rollout after two consecutive green windows.

## Gate command

```bash
pnpm run prod:provider:canary:check -- --input path/to/slo-summary.json
```

The input must satisfy thresholds in `docs/SCALE_SLO_GATES.md`.

## Rollback triggers (immediate)

- Auth bootstrap hangs or stuck loading spike.
- Booking creation/update failure regression.
- p95 latency regression on provider routes beyond Tier-1 limits.
- Tier-1 5xx/timeout thresholds breached.

If any trigger fires: rollback to last known-good release and start incident follow-up.

## Evidence required for GO

- Route-metrics snapshots (dashboard/bookings/me-role).
- Browser matrix results (including iPad Safari).
- Canary SLO summary JSON and gate output.
- Release sign-off entry in `docs/RELEASE_CHECKLIST.md`.
