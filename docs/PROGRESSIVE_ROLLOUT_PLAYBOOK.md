# Progressive Rollout Playbook

Safe launch sequence with automatic rollback triggers tied to SLOs.

## Rollout Stages

1. `Canary` (1-5% traffic)
2. `Stage A` (25% traffic)
3. `Stage B` (50% traffic)
4. `Full` (100% traffic)

Advance only when the current stage remains healthy for the required window.

## Stage Windows

- Canary: minimum 24h
- Stage A: minimum 4h
- Stage B: minimum 4h

## Automatic Stop/Rollback Triggers

- Tier-1 route 5xx rate > 0.5% in 10-minute window
- Platform 5xx rate > 0.3% in 30-minute window
- Booking failure rate > 2% in 30-minute window
- Webhook failure rate > 0.1% in 30-minute window
- DB connection utilization > 85% sustained 15 minutes

If any trigger fires:

1. Freeze rollout immediately.
2. Roll back one stage (or to previous stable revision for canary).
3. Open incident and attach SLO evidence.

## Evidence for Stage Promotion

- `scripts/prod/evaluate-rollout-gates.mjs` output = `advance`
- No active P1/P2 incidents
- No unresolved alert pages in window
- Release verification report attached

## Operator Commands

- Evaluate gates:
  - `pnpm run prod:rollout:evaluate -- --input ./artifacts/slo-summary.json`
- Dry-run stage checklist:
  - `pnpm run prod:rollout:checklist`

Sample input payload:

- `docs/artifacts/slo-summary.sample.json`
