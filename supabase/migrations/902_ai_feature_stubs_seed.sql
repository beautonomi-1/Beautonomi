-- Seed provider AI entitlements for the four documented stub features (idempotent).

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
    ('ai.provider.smart_replies'),
    ('ai.provider.pricing_assistant'),
    ('ai.provider.booking_ops'),
    ('ai.provider.reputation_coach'),
    ('ai.provider.look_describe')
) AS fk(feature_key)
WHERE sp.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.ai_plan_entitlements e
    WHERE e.plan_id = sp.id
      AND e.feature_key = fk.feature_key
  );
