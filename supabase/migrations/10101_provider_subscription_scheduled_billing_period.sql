-- Scheduled paid-to-paid downgrade: store the billing period for the target plan
-- at schedule time (may differ from current billing_period on the row).

ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_billing_period text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'provider_subscriptions_scheduled_billing_period_check'
  ) THEN
    ALTER TABLE public.provider_subscriptions
      ADD CONSTRAINT provider_subscriptions_scheduled_billing_period_check
      CHECK (
        scheduled_billing_period IS NULL
        OR scheduled_billing_period IN ('monthly', 'yearly')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.provider_subscriptions.scheduled_billing_period IS
  'Billing period for scheduled_plan_id when paid-to-paid downgrade applies at scheduled_change_at.';

-- ============================================================================
-- Keep a scheduled-downgrade row entitled after expires_at until the cron applies it.
-- ============================================================================
-- The old Paystack sub is disabled when the downgrade is scheduled, so no renewal
-- extends expires_at. The daily expire-cancelled-subscriptions cron (step 0a) applies
-- the cheaper plan, falls back to free, or retries. Between expires_at and that run the
-- row must stay on its paid plan. Same body as migration 851 plus that one condition;
-- mirrors SCHEDULED_DOWNGRADE_ENTITLED_OR in apps/web/src/lib/subscriptions/feature-access.ts.

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
        -- Scheduled paid-to-paid downgrade awaiting the daily cron.
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
