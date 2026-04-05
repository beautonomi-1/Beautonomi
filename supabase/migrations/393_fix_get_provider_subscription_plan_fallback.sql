-- Fix get_provider_subscription_plan so the free-tier fallback always runs when no active
-- provider_subscriptions row exists. The previous implementation used IF NOT FOUND after
-- RETURN QUERY, which is unreliable in PL/pgSQL (FOUND may not reflect RETURN QUERY results).
-- Also backfill provider_subscriptions for providers with NULL tenant_id (389/391 skipped them).

CREATE OR REPLACE FUNCTION get_provider_subscription_plan(provider_id_param UUID)
RETURNS TABLE (
  plan_id UUID,
  plan_name TEXT,
  is_free BOOLEAN,
  features JSONB,
  max_bookings_per_month INTEGER,
  max_staff_members INTEGER,
  max_locations INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH active AS (
    SELECT
      sp.id AS sid,
      sp.name AS sname,
      COALESCE(sp.is_free, false) AS sfree,
      COALESCE(sp.features, '{}'::jsonb) AS sfeatures,
      sp.max_bookings_per_month AS smax_bookings,
      sp.max_staff_members AS smax_staff,
      sp.max_locations AS smax_locations
    FROM public.provider_subscriptions ps
    INNER JOIN public.subscription_plans sp ON sp.id = ps.plan_id
    WHERE ps.provider_id = provider_id_param
      AND ps.status = 'active'
      AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
    LIMIT 1
  ),
  fallback AS (
    SELECT
      sp.id AS sid,
      sp.name AS sname,
      COALESCE(sp.is_free, false) AS sfree,
      COALESCE(sp.features, '{}'::jsonb) AS sfeatures,
      sp.max_bookings_per_month AS smax_bookings,
      sp.max_staff_members AS smax_staff,
      sp.max_locations AS smax_locations
    FROM public.subscription_plans sp
    WHERE sp.is_free = true
      AND sp.is_active = true
      AND NOT EXISTS (SELECT 1 FROM active)
    ORDER BY CASE WHEN sp.slug = 'free-tier-default' THEN 0 ELSE 1 END, sp.display_order NULLS LAST
    LIMIT 1
  ),
  combined AS (
    SELECT * FROM active
    UNION ALL
    SELECT * FROM fallback
  )
  SELECT
    c.sid,
    c.sname,
    c.sfree,
    c.sfeatures,
    c.smax_bookings,
    c.smax_staff,
    c.smax_locations
  FROM combined c
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_provider_subscription_plan IS 'Returns the active subscription plan for a provider, or the platform free tier when none is linked.';

-- Backfill subscriptions for any provider still missing a row (including NULL tenant_id).
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
  AND NOT EXISTS (
    SELECT 1 FROM public.provider_subscriptions ps WHERE ps.provider_id = p.id
  );
