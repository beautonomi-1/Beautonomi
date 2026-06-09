-- ============================================================================
-- Migration 666: Unify subscription plan resolution (entitlement status set)
-- ============================================================================
-- get_provider_subscription_plan previously matched ONLY status = 'active',
-- while the TypeScript resolvers (getProviderSubscriptionTier, determineProviderPlan)
-- also honour 'trialing' and a 3-day 'past_due' grace window. That divergence
-- meant a provider in grace could pass app-layer feature checks but fail the
-- SQL booking-limit RPC (or vice versa).
--
-- This aligns the SQL function to the single documented source of truth
-- (SUBSCRIPTION_ENTITLED_STATUSES in apps/web/src/lib/subscriptions/feature-access.ts):
--   active + trialing  → entitled
--   past_due           → entitled only within 3 days of the status change (updated_at)
--   anything else      → free-tier fallback
-- The free-tier fallback CTE is preserved verbatim from migration 399.
-- ============================================================================

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
      AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
      AND (
        ps.status IN ('active', 'trialing')
        OR (ps.status = 'past_due' AND ps.updated_at >= NOW() - INTERVAL '3 days')
      )
    ORDER BY CASE ps.status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END
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
    WHERE sp.is_active = true
      AND (COALESCE(sp.is_free, false) = true OR sp.slug = 'free-tier-default')
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

COMMENT ON FUNCTION get_provider_subscription_plan IS 'Returns the entitled subscription plan for a provider (active/trialing, or past_due within 3-day grace), or the platform free tier when none is entitled. Status set matches SUBSCRIPTION_ENTITLED_STATUSES in feature-access.ts.';
