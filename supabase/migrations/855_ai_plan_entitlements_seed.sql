-- Seed provider AI entitlements for all active subscription plans.
-- Idempotent: inserts only missing (plan_id, feature_key) rows; preserves admin edits.
-- Tier limits: Starter/free generous; Growth/Scale higher (matches Beautonomi catalog slugs).

INSERT INTO public.ai_plan_entitlements (plan_id, feature_key, enabled, calls_per_day, max_tokens, model_tier)
SELECT
  sp.id,
  fk.feature_key,
  true,
  CASE
    WHEN sp.slug = 'beautonomi-scale' THEN 500
    WHEN sp.slug = 'beautonomi-growth' THEN 100
    ELSE 25
  END,
  CASE
    WHEN sp.slug = 'beautonomi-scale' THEN 1200
    WHEN sp.slug = 'beautonomi-growth' THEN 800
    ELSE 600
  END,
  CASE
    WHEN sp.slug = 'beautonomi-scale' THEN 'standard'
    ELSE 'cheap'
  END
FROM public.subscription_plans sp
CROSS JOIN (
  VALUES
    ('ai.provider.profile_completion'),
    ('ai.provider.content_studio')
) AS fk(feature_key)
WHERE sp.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.ai_plan_entitlements e
    WHERE e.plan_id = sp.id
      AND e.feature_key = fk.feature_key
  );
