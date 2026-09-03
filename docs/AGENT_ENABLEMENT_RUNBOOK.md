# Agent Workforce Enablement Runbook

Staged enablement for the agent workforce (`apps/web/src/lib/agents/**`, migration `798_agent_workforce.sql`).
Agents are **off by default** and their mutations are blocked by the P0 safety gate
(`apps/web/src/lib/agents/safety-gate.ts`). This runbook is the only supported way to turn them on.

The Agentic Console (Control Plane -> Agentic Console) shows every gate below in its **Preflight** panel,
backed by `GET /api/admin/agents/gate-status?environment=<env>`. Do not proceed to a step while an earlier gate is red.

## Gates

| Gate | Where it lives | Green when | Blocks |
| --- | --- | --- | --- |
| RLS harness green | env `AGENT_RLS_HARNESS_GREEN` | `"true"` | all agent mutations (execute) |
| P0 hardening migrations verified | env `AGENT_P0_MIGRATIONS_VERIFIED` | `"true"` after confirming `787_gift_cards_rls_hardening.sql` and `788_message_attachments_storage_hardening.sql` are applied | all agent mutations |
| Master switch | `agent_module_config.master_enabled` (per environment) | `true` | *everything*: reads, runs, proposals and execution |
| Shadow mode | `agent_module_config.shadow_mode` | `false` | execution only (proposals are still written and reviewable) |
| Emergency controls | `agent_emergency_controls` (per environment) | all four flags `false` | see "Emergency controls" below |
| Per-agent operational state | `agent_operational_state.state` | `active` | that agent's runs / proposals |

Reads (copilot, ops sentinel, sweeps) need only the master switch. Execution of an approved action needs *all* gates green,
plus a valid lease (`acquireExecutionLease`) and an approval policy for the action type.

## Preflight (before flipping anything)

1. **Migrations.** In the target environment confirm `787`, `788` and `798` are present in `supabase_migrations.schema_migrations`
   (or via `supabase migration list`). Also confirm `874_ai_model_pricing.sql` so cost metering is live.
2. **RLS harness.** Run `pnpm --filter @beautonomi/web exec vitest run src/__tests__/security` (and the live RLS integration suite where
   the environment has a database URL). Only when green, set `AGENT_RLS_HARNESS_GREEN=true` in the Vercel project for that environment.
3. **Env flags.** Set `AGENT_P0_MIGRATIONS_VERIFIED=true` after step 1. Redeploy so the flags are in the running lambda.
4. **Gemini.** `gemini_integration_config` row for the environment is `enabled=true` with an API key; otherwise agents fall back to
   heuristics (safe, but you are not testing the LLM path).
5. **Spend cap.** Set `agent_module_config.global_daily_spend_cap_usd` (recommended: `5` for staging, `25` for the first production week).
   `enforceAiBudget` sums `ai_usage_log.cost_estimate`, which is now computed from `ai_model_pricing`.
6. **Slack.** Verify the `agent_action_proposed` and emergency events route to a staffed channel (Integrations -> Slack -> routing).
7. Open the Agentic Console and confirm Preflight shows only the master/shadow/agent-state gates red.

## Staged enablement

### Stage 1 - master on, shadow on (day 0)

- Agentic Console -> Module controls -> **Master enabled** on. Leave **Shadow mode** on.
- Set each agent you want to observe to `active` (start with `ops-sentinel` and `support-triage`; leave money-adjacent agents
  `payout-review`, `reconciliation-investigator`, `trust-monitor` disabled).
- Expected: `agent_runs` rows appear, proposals land in the Approvals inbox with `shadow_mode=true`, Slack pings on propose. Nothing executes.

### Stage 2 - proposal review window (days 1-7)

Daily:
- Review every proposal in the inbox. Approve/reject to exercise the approval pipeline; approving in shadow mode still does not execute.
- Check `agent_runs.total_cost_usd` and the Live runs -> steps table for token/cost per model call. Compare against `ai_usage_log`.
- Track false-positive escalations and any proposal you would not have approved. Exit criteria for a given agent:
  - >= 20 proposals reviewed, or 7 days elapsed, whichever is later
  - 0 proposals that would have caused customer-visible harm
  - < 10% rejected for reasoning quality

### Stage 3 - shadow off, per agent (day 7+)

- Shadow mode is module-wide. Before disabling it, set every agent you are *not* ready to trust to `paused` or `disabled`, so only the
  vetted agents are `active` when execution unlocks.
- Agentic Console -> **Shadow mode** off. Preflight should now show "Execution allowed".
- Execute the first approved actions manually from the inbox ("Execute now"). Confirm the `admin.agent_action.execute` audit log row,
  `agent_actions.executed_at`, and the Amplitude `agent_action_executed` event.
- Add agents back to `active` one at a time, each after its own review window.

## Emergency controls (Agentic Console -> Emergency kill switches)

| Flag | Effect | Use when |
| --- | --- | --- |
| `stop_new_runs` | No new `agent_runs` start (crons/events no-op) | runaway spend, bad prompt deploy |
| `stop_all_tool_calls` | Tool executor denies every call | tool returning wrong tenant data |
| `block_approved_execution` | `acquireExecutionLease` refuses; approved actions wait | any doubt about a batch of approvals |
| `freeze_pending_proposals` | Inbox frozen; approvals not accepted | reviewer availability / incident |

Activating any flag posts to Slack (`slackNotifyAgentEmergencyActivated`) and writes a config-change + audit log. Flags persist until
cleared by hand; the Preflight panel lists them as blockers.

## Rollback

Fastest to slowest, all reversible:

1. **Shadow mode on** - stops execution immediately, keeps observability. Preferred first move.
2. **`block_approved_execution` + `stop_new_runs`** - freezes everything in flight without touching config history.
3. **Master off** - stops reads too (copilot, sweeps). Use if the module itself is misbehaving.
4. **Agent state `disabled`** - per-agent surgical stop.
5. Unset `AGENT_RLS_HARNESS_GREEN` / `AGENT_P0_MIGRATIONS_VERIFIED` and redeploy - only if the gate inputs themselves were wrong.

Already-executed actions are not rolled back by any switch; use the normal support/finance reversal flows and reference the
`agent_actions.id` in the audit note.

## Operational checks after enablement

- `agent_runs` with `status='running'` older than 15 minutes -> stuck run; check `agent_steps.error` for the run.
- `agent_runs.total_cost_usd` daily sum approaching `global_daily_spend_cap_usd` -> `enforceAiBudget` will start returning
  `fallback_mode: "templates_only"` for provider AI features (they keep working with template output).
- Sentry: filter `source:gemini` with tags `feature_key` / `model` for model-call failures.
- Amplitude: `agent_action_proposed`, `agent_action_executed`, `ai_feature_called` (properties: `feature_key`, `cache_hit`, `fallback`, tokens, cost).
