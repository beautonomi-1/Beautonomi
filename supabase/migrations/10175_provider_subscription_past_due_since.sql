-- Provider past_due grace was measured from updated_at. The
-- update_provider_subscriptions_updated_at trigger sets that column on every
-- update, so a dunning retry restarted the 3-day window and paid access never
-- lapsed. Customer memberships already store the first failure on
-- past_due_since. Provider subscriptions use the same column.

ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

COMMENT ON COLUMN public.provider_subscriptions.past_due_since IS
  'When a non-Apple subscription first entered past_due. Later retries must not move it. Apple grace uses apple_grace_period_expires_at.';

UPDATE public.provider_subscriptions
SET past_due_since = updated_at
WHERE status = 'past_due'
  AND past_due_since IS NULL
  AND billing_provider IS DISTINCT FROM 'apple';

CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_past_due_since
  ON public.provider_subscriptions (past_due_since)
  WHERE status = 'past_due' AND past_due_since IS NOT NULL;

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
        OR (
          ps.billing_provider = 'apple'
          AND ps.apple_grace_period_expires_at IS NOT NULL
          AND ps.apple_grace_period_expires_at > NOW()
        )
        OR (
          ps.status = 'past_due'
          AND ps.billing_provider IS DISTINCT FROM 'apple'
          AND COALESCE(ps.past_due_since, ps.updated_at) >= NOW() - INTERVAL '3 days'
        )
        OR ps.scheduled_plan_id IS NOT NULL
      )
      AND (
        ps.status IN ('active', 'trialing')
        OR (
          ps.status = 'past_due'
          AND CASE
            WHEN ps.billing_provider = 'apple' THEN
              ps.apple_grace_period_expires_at IS NOT NULL
              AND ps.apple_grace_period_expires_at > NOW()
            ELSE COALESCE(ps.past_due_since, ps.updated_at) >= NOW() - INTERVAL '3 days'
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
