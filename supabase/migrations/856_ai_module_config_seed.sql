-- Seed AI module config per environment so entitlement checks can proceed.
-- Production is enabled; Gemini still requires an API key in Control Plane.
-- Idempotent: does not overwrite admin edits.

INSERT INTO public.ai_module_config (
  environment,
  enabled,
  daily_budget_credits,
  per_provider_calls_per_day,
  per_user_calls_per_day,
  max_tokens
)
SELECT v.environment, true, 0, 0, 0, 600
FROM (
  VALUES
    ('development'),
    ('staging'),
    ('production')
) AS v(environment)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ai_module_config c
  WHERE c.environment = v.environment
);
