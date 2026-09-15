-- Migration 909: Seed global AI Platform + agent workforce for end-to-end operation.
-- Idempotent — safe to re-run. Does NOT overwrite gateway_api_key_secret (set via Control Plane or seed script).
-- After migrate: run `pnpm seed:ai-platform` to sync live Gateway model IDs into the catalog.

-- ── 1. Global AI runtime (Gateway-first cheap stack) ─────────────────────────
INSERT INTO public.ai_runtime_config (
  tenant_id, environment, enabled, runtime, default_model_id, failover_enabled
)
SELECT NULL, env, true, 'vercel_gateway', 'alibaba/qwen3.7-flash', true
FROM (VALUES ('production'), ('staging'), ('development')) AS v(env)
ON CONFLICT (environment) WHERE (tenant_id IS NULL) DO UPDATE
SET
  enabled = true,
  runtime = 'vercel_gateway',
  default_model_id = CASE
    WHEN ai_runtime_config.default_model_id IN (
      'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro',
      'google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash'
    ) THEN EXCLUDED.default_model_id
    ELSE ai_runtime_config.default_model_id
  END,
  failover_enabled = true,
  updated_at = NOW();

-- ── 2. Model catalog (global): cheap stack + embeddings + safeguard ─────────
INSERT INTO public.ai_model_catalog (
  environment, tenant_id, model_id, provider, tier, capability, gateway, enabled, eval_passed_at
)
SELECT e.env, NULL, m.model_id, m.provider, m.tier, m.capability, true, true, NOW()
FROM (VALUES ('production'), ('staging'), ('development')) AS e(env)
CROSS JOIN (
  VALUES
    ('alibaba/qwen3.7-flash', 'alibaba', 'lite', 'chat'),
    ('deepseek/deepseek-chat', 'deepseek', 'flash', 'chat'),
    ('openai/text-embedding-3-small', 'openai', 'lite', 'embedding'),
    ('openai/gpt-oss-safeguard-20b', 'openai', 'flash', 'chat')
) AS m(model_id, provider, tier, capability)
ON CONFLICT (environment, model_id) WHERE (tenant_id IS NULL) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  gateway = true,
  tier = EXCLUDED.tier,
  capability = EXCLUDED.capability,
  eval_passed_at = COALESCE(ai_model_catalog.eval_passed_at, EXCLUDED.eval_passed_at),
  updated_at = NOW();

-- Disable legacy direct Gemini (Gateway stack is primary)
UPDATE public.ai_model_catalog
SET enabled = false, updated_at = NOW()
WHERE tenant_id IS NULL
  AND gateway = false
  AND model_id IN ('gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro');

-- Disable seeded Gateway Google/OpenAI chat rows not in cheap stack (avoid accidental routing)
UPDATE public.ai_model_catalog
SET enabled = false, updated_at = NOW()
WHERE tenant_id IS NULL
  AND gateway = true
  AND model_id IN (
    'google/gemini-2.5-flash-lite',
    'google/gemini-2.5-flash',
    'openai/gpt-4.1-mini',
    'anthropic/claude-sonnet-4.5'
  );

-- ── 3. AI module + emergency (platform LLM entitlement) ───────────────────────
UPDATE public.ai_module_config
SET enabled = true, updated_at = NOW()
WHERE tenant_id IS NULL
  AND environment IN ('production', 'staging', 'development');

INSERT INTO public.ai_module_config (environment, tenant_id, enabled, daily_budget_credits, max_tokens)
SELECT v.environment, NULL, true, 0, 800
FROM (VALUES ('production'), ('staging'), ('development')) AS v(environment)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_module_config c
  WHERE c.environment = v.environment AND c.tenant_id IS NULL
);

UPDATE public.ai_emergency_controls
SET
  stop_all_calls = false,
  force_template_fallback = false,
  disable_streaming = false,
  disable_vision = false,
  disable_embeddings = false
WHERE environment IN ('production', 'staging', 'development');

-- ── 4. Agent module: master on, shadow on (proposal E2E), routing policy ─────
UPDATE public.agent_module_config
SET
  master_enabled = true,
  shadow_mode = true,
  default_routing_policy_id = '{"defaultTier":"lite","taskTier":{"complex_reasoning":"flash","copilot":"flash"}}',
  global_daily_spend_cap_usd = CASE environment
    WHEN 'production' THEN 25.0000
    ELSE 5.0000
  END,
  updated_at = NOW()
WHERE environment IN ('production', 'staging', 'development');

UPDATE public.agent_emergency_controls
SET
  stop_new_runs = false,
  stop_all_tool_calls = false,
  block_approved_execution = false,
  freeze_pending_proposals = false,
  activated_by = NULL,
  activated_at = NULL,
  reason = NULL
WHERE environment IN ('production', 'staging', 'development');

-- ── 5. Agent brains (see apps/web/src/lib/agents/default-roster-seed.ts) ─────
-- Default routing: preferred_model_id + fallback_model_id NULL.
-- Vision enabled on all agents (cheap Qwen stack supports vision when images are sent).
UPDATE public.agent_definitions d
SET
  preferred_model_id = NULL,
  fallback_model_id = NULL,
  max_cost_usd_per_run = 0.25,
  task_default = v.task_default,
  vision_enabled = v.vision_enabled
FROM (
  VALUES
    ('ops-sentinel', 'classification', true),
    ('support-triage', 'classification', true),
    ('support-lead', 'drafting', true),
    ('payout-review', 'classification', true),
    ('reconciliation-investigator', 'classification', true),
    ('refund-specialist', 'classification', true),
    ('provider-success', 'drafting', true),
    ('membership-shepherd', 'drafting', true),
    ('trust-monitor', 'classification', true),
    ('content-moderator', 'classification', true),
    ('admin-copilot', 'copilot', true)
) AS v(key, task_default, vision_enabled)
WHERE d.key = v.key;

-- ── 6. Activate full workforce roster (crons + copilot) ───────────────────────
UPDATE public.agent_operational_state aos
SET state = 'active', updated_at = NOW()
FROM public.agent_definitions d
WHERE aos.agent_id = d.id
  AND d.key IN (
    'ops-sentinel', 'support-triage', 'support-lead', 'payout-review',
    'reconciliation-investigator', 'refund-specialist', 'provider-success',
    'membership-shepherd', 'trust-monitor', 'content-moderator', 'admin-copilot'
  );

INSERT INTO public.agent_operational_state (agent_id, state)
SELECT d.id, 'active'
FROM public.agent_definitions d
WHERE d.key IN (
  'ops-sentinel', 'support-triage', 'support-lead', 'payout-review',
  'reconciliation-investigator', 'refund-specialist', 'provider-success',
  'membership-shepherd', 'trust-monitor', 'content-moderator', 'admin-copilot'
)
ON CONFLICT (agent_id) DO UPDATE
SET state = 'active', updated_at = NOW();

COMMENT ON TABLE public.ai_runtime_config IS
  'Platform AI runtime. Migration 909 seeds global Gateway cheap stack; set gateway_api_key_secret via Control Plane.';
