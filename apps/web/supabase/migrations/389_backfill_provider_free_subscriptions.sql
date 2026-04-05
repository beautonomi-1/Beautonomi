-- Backfill provider_subscriptions for providers that have no row yet, using the active free catalog plan.
-- Pairs with 388 so get_provider_subscription_plan / booking limits resolve consistently.

INSERT INTO public.provider_subscriptions (
  provider_id,
  plan_id,
  status,
  tenant_id,
  started_at,
  expires_at
)
SELECT
  p.id,
  sp.id,
  'active',
  p.tenant_id,
  NOW(),
  NULL
FROM public.providers p
INNER JOIN LATERAL (
  SELECT id
  FROM public.subscription_plans
  WHERE is_free = true
    AND is_active = true
  ORDER BY display_order ASC NULLS LAST
  LIMIT 1
) sp ON true
WHERE p.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.provider_subscriptions ps
    WHERE ps.provider_id = p.id
  );
