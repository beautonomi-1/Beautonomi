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
- **Flow**: Resolve provider → check entitlement → enforce budget → load Gemini config → build provider context → load prompt template (or use built-in) → call Gemini → log usage → return JSON.
- **Features** (built-in templates):
  - `ai.provider.profile_completion`: suggested_profile_patch (headline, bio, specialties, faq, policies)
  - `ai.provider.content_studio`: post_captions, hashtags, short_description

Stub features (off by default): smart_replies, pricing_assistant, booking_ops, reputation_coach.

## Templates and usage (Superadmin)

- **Templates**: `ai_prompt_templates` table (key, version, enabled, platform_scopes, role_scopes, template, system_instructions, output_schema). Managed from **Control Plane → Modules → AI → Templates** (list and create).
- **Usage**: `ai_usage_log` is used for dashboards and cost estimates. **Control Plane → Modules → AI → Usage** lists usage log entries.
- **Entitlements**: **Control Plane → Modules → AI → Entitlements** lists and manages plan-based AI entitlements.

## Caching

- **Table**: `ai_cache` (key_hash, feature_key, provider_id, response, expires_at)
- Cache key can be derived from feature_key + provider_id + input hash. TTL from `ai_module_config.cache_ttl_seconds`. Implemented in the provider AI route when needed.
