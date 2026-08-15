-- ============================================================================
-- Migration 851: Honour the Apple billing-retry grace window in SQL resolution
-- ============================================================================
-- Migration 666 aligned get_provider_subscription_plan with the TypeScript
-- resolvers: active/trialing are entitled, past_due is entitled for 3 days after
-- the status change, everything else falls back to the free tier.
--
-- Apple-billed subscriptions do not fit that shape. When a renewal fails, Apple
-- keeps retrying the card for up to 16 days and reports the deadline on the
-- transaction as gracePeriodExpiresDate (stored in
-- provider_subscriptions.apple_grace_period_expires_at). Two things broke:
--
--   1. expires_at has already lapsed during billing retry, so the row was
--      filtered out before the past_due branch could ever match.
--   2. The 3-day window cut Apple customers off well before Apple stops trying,
--      which would revoke paid features from someone Apple still considers a
--      subscriber and may yet successfully charge.
--
-- This teaches the SQL resolver the Apple window so the booking-limit RPC agrees
-- with getProviderSubscriptionTier and determineProviderPlan.
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
      AND (
        ps.expires_at IS NULL
        OR ps.expires_at > NOW()
        -- Apple keeps the entitlement alive while it retries the card.
        OR (
          ps.billing_provider = 'apple'
          AND ps.apple_grace_period_expires_at IS NOT NULL
          AND ps.apple_grace_period_expires_at > NOW()
        )
      )
      AND (
        ps.status IN ('active', 'trialing')
        OR (
          ps.status = 'past_due'
          AND CASE
            WHEN ps.billing_provider = 'apple' THEN
              ps.apple_grace_period_expires_at IS NOT NULL
              AND ps.apple_grace_period_expires_at > NOW()
            ELSE ps.updated_at >= NOW() - INTERVAL '3 days'
          END
        )
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

COMMENT ON FUNCTION get_provider_subscription_plan IS 'Returns the entitled subscription plan for a provider (active/trialing, past_due within the 3-day Paystack grace, or past_due within the Apple gracePeriodExpiresDate window), or the platform free tier when none is entitled. Status set matches SUBSCRIPTION_ENTITLED_STATUSES in feature-access.ts.';

-- Keeps the grace-window lookups above off a sequential scan.
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_apple_grace
  ON public.provider_subscriptions (apple_grace_period_expires_at)
  WHERE billing_provider = 'apple' AND apple_grace_period_expires_at IS NOT NULL;
