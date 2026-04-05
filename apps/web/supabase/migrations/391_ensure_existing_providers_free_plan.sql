-- Ensure existing providers are subscribed to the free catalog plan:
-- 1) Insert provider_subscriptions when missing (prefer subscription_plans.slug = free-tier-default).
-- 2) Reactivate lapsed rows (expired / cancelled / active with past expires_at) onto the free plan.
-- Skips past_due (billing recovery). Does not modify active subscriptions with future expires_at.

WITH free_plan AS (
  SELECT COALESCE(
    (SELECT id FROM public.subscription_plans WHERE slug = 'free-tier-default' AND is_active = true LIMIT 1),
    (SELECT id FROM public.subscription_plans WHERE is_free = true AND is_active = true ORDER BY display_order ASC NULLS LAST LIMIT 1)
  ) AS id
)
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
  fp.id,
  'active',
  p.tenant_id,
  NOW(),
  NULL
FROM public.providers p
CROSS JOIN free_plan fp
WHERE fp.id IS NOT NULL
  AND p.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.provider_subscriptions ps WHERE ps.provider_id = p.id
  );

UPDATE public.provider_subscriptions ps
SET
  plan_id = fp.id,
  status = 'active',
  expires_at = NULL,
  updated_at = NOW()
FROM (
  SELECT COALESCE(
    (SELECT id FROM public.subscription_plans WHERE slug = 'free-tier-default' AND is_active = true LIMIT 1),
    (SELECT id FROM public.subscription_plans WHERE is_free = true AND is_active = true ORDER BY display_order ASC NULLS LAST LIMIT 1)
  ) AS id
) fp
WHERE fp.id IS NOT NULL
  AND (
    ps.status IN ('expired', 'cancelled')
    OR (
      ps.status = 'active'
      AND ps.expires_at IS NOT NULL
      AND ps.expires_at < NOW()
    )
  );
