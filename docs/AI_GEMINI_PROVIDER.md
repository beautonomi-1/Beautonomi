# AI (Gemini) Provider Assistant

Provider-facing AI features are powered by the **Google Gemini API**, with strict cost controls, subscription gating, and provider-scoped context.

## Architecture

- **Server-only**: API key is read from `gemini_integration_config` (per environment). Never exposed to the client.
- **Provider context**: A compact “context capsule” (provider name, description, locations, offerings, policies) is built per request and passed into the model’s system prompt.
- **Subscription-gated**: Each AI feature is tied to `ai_plan_entitlements` (per plan). A provider must have an active plan with the feature enabled and within limits.
- **Budget enforcement**: Global and per-provider/per-user daily limits are enforced before calling Gemini. Usage is logged in `ai_usage_log`.

## Context capsule

**Module**: `apps/web/src/lib/ai/provider-context.ts`

- **Input**: `provider_id`
- **Data**: providers (name, description, status), provider_locations (city, area), services (name, duration, price), minimal policies. No other providers’ data.
- **Output**: JSON object capped at ~2–4 KB, injected into the system prompt via `formatCapsuleForPrompt()`.

## Entitlements

- **Table**: `ai_plan_entitlements` (plan_id, feature_key, enabled, calls_per_day, max_tokens, model_tier)
- **Resolution**: `determineProviderPlan(provider_id)` → active `provider_subscriptions.plan_id`; then `getPlanEntitlements(plan_id, feature_key)`.
- Provider AI endpoints check:
  1. Feature flag (if any) for the feature
  2. Plan entitlement enabled
  3. Global AI module config enabled
  4. Budget and per-provider/per-user limits (via `enforceAiBudget`)

## Budget enforcement

**Module**: `apps/web/src/lib/ai/enforce-budget.ts`

- **enforceAiBudget()**: Checks `ai_module_config` (enabled, daily_budget_credits, per_provider_calls_per_day, per_user_calls_per_day). If any limit is exceeded, returns `{ allowed: false, reason, fallback_mode }`.
- **logAiUsage()**: Inserts into `ai_usage_log` (actor_user_id, provider_id, feature_key, model, tokens_in, tokens_out, cost_estimate, success, error_code).

## Provider AI endpoint

**Route**: `POST /api/provider/ai/[feature_key]`

- **Auth**: `requireRoleInApi(['provider_owner','provider_staff'])`, `getProviderIdForUser()`
- **Flow**: Resolve provider → check entitlement → enforce budget → load Gemini config → build provider context → load prompt template (`ai_prompt_templates`, else built-in) → call Gemini with `responseSchema` → compute cost → log usage → cache → return JSON.
- **Shipped features** (built-in templates in `apps/web/src/lib/ai/feature-templates.ts`):
  - `ai.provider.profile_completion`: suggested_profile_patch (headline, bio, specialties, faq, policies)
  - `ai.provider.content_studio`: post_captions, hashtags, short_description
- Any other `feature_key` returns 404. The previously documented `smart_replies`, `pricing_assistant`, `booking_ops` and `reputation_coach` features are **not shipped**; adding one requires an entitlement seed, a prompt template, a fallback builder and UI.
- **Budget fallback**: when `enforceAiBudget` returns `fallback_mode: "templates_only"` (daily budget, per-provider/user caps, global spend cap) the route returns **200** with a deterministic payload built from the provider capsule (`feature-fallbacks.ts`) and `fallback: true` / `fallback_reason`. `fallback_mode: "off"` (module disabled) still returns 403.
- **Rate limit**: 30 Gemini calls/minute per provider, enforced through the shared Upstash rate-limit store (`@/lib/rate-limit/store`, in-process fallback when Upstash env is absent). Limited calls return 429.
- **Failures** are reported to Sentry with tags `source=gemini`, `feature_key`, `model`, `stage`.
- **Analytics**: every call emits Amplitude `ai_feature_called` (feature_key, cache_hit, fallback, tokens_in/out, cost_usd) via the server tracker.

## Cost metering

- **Table**: `ai_model_pricing` (model PK, input_usd_per_1k, output_usd_per_1k, effective_from, is_active) — migration 874, superadmin-editable.
- `apps/web/src/lib/ai/pricing.ts` caches the table for 5 minutes and exposes `estimateCostUsd(model, tokensIn, tokensOut)`; unknown models fall back to in-code defaults so spend is never recorded as 0.
- Written to `ai_usage_log.cost_estimate` (provider features) and `agent_steps.cost_usd` + `agent_runs.total_*` (agent LLM calls via `callAgentLlm({ runId })`).
- `enforceAiBudget` sums `cost_estimate` for the day against `agent_module_config.global_daily_spend_cap_usd`.

## Templates and usage (Superadmin)

- **Templates**: `ai_prompt_templates` table (key, version, enabled, platform_scopes, role_scopes, template, system_instructions, output_schema). Managed from **Control Plane → Modules → AI → Templates** (list and create).
  - Runtime resolution (`apps/web/src/lib/ai/prompt-templates.ts`): highest enabled `version` for `key = feature_key`, cached 5 minutes; `system_instructions` → system prompt, `template` → user prompt, non-empty `output_schema` → Gemini `responseSchema`. Missing/disabled rows fall back to the built-in template.
- **Usage**: `ai_usage_log` is used for dashboards and cost estimates. **Control Plane → Modules → AI → Usage** lists usage log entries.
- **Entitlements**: **Control Plane → Modules → AI → Entitlements** lists and manages plan-based AI entitlements.

## Caching

- **Table**: `ai_cache` (key_hash, feature_key, provider_id, response, expires_at)
- Key: `sha256(feature_key:provider_id:<template version>:<user prompt>:<model>)`. TTL from `ai_module_config.cache_ttl_seconds` (default 24h). Cache hits skip Gemini and are reported with `cache_hit: true` in analytics.
