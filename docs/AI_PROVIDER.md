# AI provider platform

Multi-provider LLM runtime for provider AI features and agent workflows. All model calls go through `callLlm()` in `apps/web/src/lib/ai/call-llm.ts`.

## Guardrails (non-negotiable)

- **Secrets never leave the server.** Admin APIs return `*_key_set` booleans and masked previews only. Blank credential input means keep existing.
- **Encryption at rest** follows the existing integration-config pattern (plain TEXT, service-role, RLS superadmin). Platform-wide pgcrypto/Vault migration is tracked separately.
- **Every config change is audited** via `writeConfigChangeLog` and `writeAuditLog` with `module: platform_config`, `risk_level: high` for credentials/runtime.
- **Admin is source of truth.** AI may suggest moderation, pricing, or content — it never writes `explore_posts.is_hidden`, prices, customer messages, or published content without human action.
- **Tenant scoping** uses nullable `tenant_id` with partial unique indexes (global vs per-tenant), mirroring migration 356.
- **PII redaction** runs inside `callLlm` via `redactPii()` before any external provider call.
- **Fail safe.** Missing config, kill switch, breaker, or budget exhaustion degrades to deterministic template fallbacks — never an unmetered call.
- **Access control:** `requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG)` + superadmin nav.

## Runtime modes

| Mode | Description |
|------|-------------|
| `direct_gemini` | Default. Uses `gemini_integration_config` + `callGemini` adapter. |
| `vercel_gateway` | Vercel AI Gateway at `https://ai-gateway.vercel.sh/v1`. |
| `direct_openai` | OpenAI API key from `ai_runtime_config`. |
| `direct_anthropic` | Anthropic API key from `ai_runtime_config`. |

Model selection: per-feature `ai_prompt_templates.model_id` → `routeModel()` from entitlement tier → runtime default → Gemini default. Only **enabled** catalog rows are allowed.

## Admin

- **Control page:** Admin → Control plane → Integrations → **AI Platform** (`/admin/control-plane/integrations/ai`) — tabs: Overview, Gateway (Vercel), Workforce, Budgets, Safety
- **Legacy redirect:** `/integrations/gemini` → AI Platform hub
- **Emergency controls:** `ai_emergency_controls` — `stop_all_calls`, `force_template_fallback`, `disable_streaming`, `disable_vision`, `disable_embeddings`
- **Eval gate:** Production catalog rows require `eval_passed_at` before enable.

## Metering & retention

`ai_usage_log` stores: tokens, cost estimate, model, provider, runtime, gateway flag, latency, fallback/breaker flags, tenant_id. **Prompt bodies are not stored** — only hashes in cache keys.

Retention follows audit tiers in `apps/web/src/lib/audit/audit.ts`. Purge jobs align with operational tier (~3 years).

## POPIA / GDPR

- Provider context capsule is provider-scoped; customer PII is redacted before outbound calls.
- Prefer vendor zero-retention / no-training settings where available.
- Providers may opt out via `providers.ai_opt_out`.

## Embeddings (explore similar looks)

- Table `explore_post_embeddings` (migration 903) + RPC `explore_match_posts` filters `status = published` and `is_hidden = false`.
- Upsert on explore publish (POST + PATCH) and admin unhide; delete on post delete/hide.
- Nightly backfill cron: `GET /api/cron/explore-embeddings-backfill` (also in `vercel.json`). Manual trigger: `CRON_SECRET=… APP_URL=… node apps/web/scripts/backfill-explore-embeddings.mjs`.

## Budgets & attribution

- `ai_module_config`: daily credits, `monthly_budget_usd`, `alert_threshold_pct` (global row; tenant rows supported in schema).
- `enforceAiBudget` scopes monthly spend to `tenant_id` when the provider belongs to a tenant.
- Slack alerts at threshold via `slackNotifyAiBudgetThreshold`.

## Live Gateway model catalog

Admin and runtime model lists are synced from **Vercel AI Gateway** (`GET https://ai-gateway.vercel.sh/v1/models`, public, cached 15 minutes). New Gateway models appear automatically; admin only stores **preferences** (enabled, tier override, eval gate) in `ai_model_catalog`.

- **Admin UI:** searchable Gateway catalog (~400+ models), provider-grouped default-model dropdown, live pricing from Gateway, **Refresh catalog** button (15-min cache bust), **Mark eval passed** for production enable gate, direct Gemini enable toggles separate from Gateway.
- **Runtime:** `resolveAiRuntime()` merges live Gateway models + DB enable flags + direct Gemini rows.
- **Cost estimates:** Gateway per-token pricing used when no `ai_model_pricing` row exists.

## Admin UI coverage

The **AI Platform hub** includes: Vercel-first setup checklist, Gateway tab (credentials, presets with confirm, grouped live catalog, failover toggle), Workforce tab (full agent roster with catalog-backed model pickers, routing policy, cron map), Budgets tab (USD spend breakdown agent vs provider AI), and Safety tab (dual AI + agent emergency panels). **Agentic Console** remains the home for approvals inbox, live runs, and copilot.

Provider AI module page adds monthly budget fields; Usage tab shows provider/runtime/latency/cost; Templates tab supports per-row model override.

## Rollout

1. Apply migrations 899–903 (Gemini catalog rows enabled; Gateway rows disabled).
2. Production stays `direct_gemini` until admin enables Gateway.
3. Staging canary: flip runtime to `vercel_gateway`, enable one extra model.
4. Production canary: content studio first, then agents.
5. **Rollback:** set runtime back to `direct_gemini` or engage `stop_all_calls`.

## Follow-up ticket

Platform-wide encryption for all `*_secret` integration columns (pgcrypto or Supabase Vault).
