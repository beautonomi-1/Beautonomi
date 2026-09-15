-- Migration 911: Optimal cheap Gateway catalog — qwen3.7 lite, flash chat failover, safeguard + embeddings.
-- Safeguard/embedding stay enabled but are excluded from automatic chat routing (router.ts).

UPDATE public.ai_runtime_config
SET
  default_model_id = 'alibaba/qwen3.7-flash',
  enabled = true,
  runtime = 'vercel_gateway',
  failover_enabled = true,
  updated_at = NOW()
WHERE tenant_id IS NULL
  AND environment IN ('production', 'staging', 'development');

-- Primary lite chat (cheapest)
INSERT INTO public.ai_model_catalog (
  environment, tenant_id, model_id, provider, tier, capability, gateway, enabled, eval_passed_at
)
SELECT e.env, NULL, 'alibaba/qwen3.7-flash', 'alibaba', 'lite', 'chat', true, true, NOW()
FROM (VALUES ('production'), ('staging'), ('development')) AS e(env)
ON CONFLICT (environment, model_id) WHERE (tenant_id IS NULL) DO UPDATE
SET enabled = true, tier = 'lite', capability = 'chat', gateway = true, eval_passed_at = COALESCE(ai_model_catalog.eval_passed_at, NOW()), updated_at = NOW();

-- Disable newer/pricier duplicate lite Qwen when both exist
UPDATE public.ai_model_catalog
SET enabled = false, updated_at = NOW()
WHERE tenant_id IS NULL
  AND model_id = 'alibaba/qwen3.8-flash';

-- Flash chat failover (copilot / complex_reasoning) — run pnpm seed:ai-platform to refresh ID from live Gateway
INSERT INTO public.ai_model_catalog (
  environment, tenant_id, model_id, provider, tier, capability, gateway, enabled, eval_passed_at
)
SELECT e.env, NULL, 'deepseek/deepseek-chat', 'deepseek', 'flash', 'chat', true, true, NOW()
FROM (VALUES ('production'), ('staging'), ('development')) AS e(env)
ON CONFLICT (environment, model_id) WHERE (tenant_id IS NULL) DO UPDATE
SET enabled = true, tier = 'flash', capability = 'chat', gateway = true, eval_passed_at = COALESCE(ai_model_catalog.eval_passed_at, NOW()), updated_at = NOW();

-- Moderation safeguard (explicit modelId only — not auto-routed)
INSERT INTO public.ai_model_catalog (
  environment, tenant_id, model_id, provider, tier, capability, gateway, enabled, eval_passed_at
)
SELECT e.env, NULL, 'openai/gpt-oss-safeguard-20b', 'openai', 'flash', 'chat', true, true, NOW()
FROM (VALUES ('production'), ('staging'), ('development')) AS e(env)
ON CONFLICT (environment, model_id) WHERE (tenant_id IS NULL) DO UPDATE
SET enabled = true, gateway = true, eval_passed_at = COALESCE(ai_model_catalog.eval_passed_at, NOW()), updated_at = NOW();

-- Explore embeddings (embedding path only — not auto-routed for chat)
INSERT INTO public.ai_model_catalog (
  environment, tenant_id, model_id, provider, tier, capability, gateway, enabled, eval_passed_at
)
SELECT e.env, NULL, 'openai/text-embedding-3-small', 'openai', 'lite', 'embedding', true, true, NOW()
FROM (VALUES ('production'), ('staging'), ('development')) AS e(env)
ON CONFLICT (environment, model_id) WHERE (tenant_id IS NULL) DO UPDATE
SET enabled = true, capability = 'embedding', gateway = true, eval_passed_at = COALESCE(ai_model_catalog.eval_passed_at, NOW()), updated_at = NOW();
