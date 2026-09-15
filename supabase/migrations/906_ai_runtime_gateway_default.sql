-- Migration 906: Gateway-first default runtime (rollback remains direct_gemini via admin).

INSERT INTO public.ai_runtime_config (
  tenant_id,
  environment,
  enabled,
  runtime,
  default_model_id,
  failover_enabled
)
SELECT
  NULL,
  env,
  false,
  'vercel_gateway',
  'alibaba/qwen3.7-flash',
  true
FROM (VALUES ('production'), ('staging'), ('development')) AS v(env)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_runtime_config arc
  WHERE arc.environment = v.env AND arc.tenant_id IS NULL
);

UPDATE public.ai_runtime_config
SET runtime = 'vercel_gateway'
WHERE tenant_id IS NULL
  AND runtime = 'direct_gemini'
  AND default_model_id IN ('gemini-2.5-flash-lite', 'google/gemini-2.5-flash-lite');
