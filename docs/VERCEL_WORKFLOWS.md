# Vercel Workflows (pilot: support triage)

Durable execution for long-running, multi-step jobs. The pilot ships one
workflow, `supportTriageWorkflow`, dark behind a per-family flag. Legacy
inline/cron paths keep running unchanged when the flag is off.

## Layout

```
apps/web/src/workflows/
  config.ts                         WORKFLOWS_ENABLED parsing, isWorkflowFamilyEnabled()
  start-support-triage.ts           start() when family "agent" is on, else legacy after() path
  resume-agent-approval-hook.ts     admin approve/reject -> resumeHook(`agent-approval:<actionId>`)
  agents/support-triage.workflow.ts "use workflow" orchestrator (no I/O)
  steps/                            "use step" side effects (Supabase, Paystack, agents)
  __tests__/                        directive/static checks + orchestrator unit tests
```

Design rules (enforced by `__tests__/directives.test.ts`):

- Orchestrators (`*.workflow.ts`) start with `"use workflow"` and never touch
  Supabase, `fetch`, `Date.now()` or randomness. All side effects live in
  `steps/*` functions that start with `"use step"`.
- Steps are idempotent on domain keys. Non-retryable rejections throw
  `FatalError` (`workflow`), e.g. the agent kill switch
  (`agent_emergency_controls.stop_new_runs`) or a duplicate active run.
- Every run is registered in `workflow_runs` (migration 865) via
  `steps/run-registry.ts`; the partial unique index on
  `(workflow, domain_id) WHERE status = 'running'` prevents duplicate runs.
  `agent_runs.workflow_run_id` links agent history to the durable run.

## Rollout flag

`WORKFLOWS_ENABLED` is a comma-separated list of families or `all`:

| Family         | Status          |
| -------------- | --------------- |
| `agent`        | pilot (support triage) |
| `settlement`, `notification`, `dunning`, `gift-card`, `ads`, `onboarding` | reserved, not implemented |

When `agent` is on:

- `POST /api/me/support-tickets` and `/api/provider/support-tickets` call
  `startSupportTriageForTicket`, which `start()`s the workflow (falls back to
  the legacy path if `start()` throws).
- `agent-workforce-sweep` skips tickets with a running `workflow_runs` row and
  starts workflows for the rest instead of running triage inline.
- `expireStaleProposals` leaves proposals owned by running workflows alone; the
  workflow's own `sleep(approval_expires_at)` closes them.
- Admin approve/reject routes resume the hook; a `HookNotFoundError` is
  expected for legacy actions and swallowed. On timeout the workflow re-reads
  `agent_actions.status`, so a decision made before the hook registered is
  never lost.

## Runtime plumbing

- `next.config.mjs`: `withSentryConfig(withWorkflow(analyzer(config)))`.
- `proxy.ts`: `/.well-known/workflow/*` bypasses middleware (matcher excludes
  it too).
- `turbo.json`: `src/app/.well-known/workflow/**` is a cached build output.
- `tsconfig.json`: `"plugins": [{ "name": "workflow" }]` for directive
  IntelliSense.
- `.gitignore`: `.workflow-data/` (local world state).

## Local development

```bash
cd apps/web
WORKFLOWS_ENABLED=agent pnpm dev
npx workflow web          # local run inspector (Local World)
```

Create a support ticket, then approve/reject the proposed action from the
admin console; the run should advance from the hook suspension.

## Tests

```bash
cd apps/web
pnpm exec vitest run src/workflows --reporter=dot
```

## Operations

- Run traces: Vercel dashboard -> Workflows. `workflow_runs.run_id` is the
  SDK run id.
- Terminal failures set `workflow_runs.status = 'failed'` with the error
  message; the orchestrator rethrows so the SDK marks the run failed.
- Rollback: unset `WORKFLOWS_ENABLED` (or remove `agent`). In-flight runs
  finish on the pinned deployment; new tickets use the legacy path.
