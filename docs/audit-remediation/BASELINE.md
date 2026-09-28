# Platform audit remediation — test baseline

Recorded at start of remediation (2026-09-27).

Full `apps/web` vitest after remediation: 3446/3451 pass. The 5 failures are outside remediation scope
(time-clock contract mock missing `providers`, `staff/join/set-password` permission helper,
`payroll-rules-monitor` cron lock, undocumented `hint_action` analytics event).

Run before/after each phase to detect regressions:

```bash
pnpm typecheck
pnpm lint
pnpm test
# RLS static harness (apps/web):
pnpm --filter web test -- rls-harness
```

Note: Full monorepo `pnpm test` may take several minutes. Compare failures only to new changes in this remediation branch.
