-- F8 — Provider analytics materialisation.
--
-- 1. provider_analytics_by_service(p_provider_id, p_from, p_to) RPC:
--    Distinct-booking count + revenue per offering for a provider over a window.
--    Replaces the app-side .limit(1000) scan in /api/provider/analytics.
--
-- 2. provider_analytics_daily:
--    Daily per-provider roll-up refreshed by a nightly cron.
--    Seeds simple revenue / booking counters so dashboards can serve
--    aggregates from this table rather than ad-hoc scans.
--
-- 3. refresh_provider_analytics_daily(p_since, p_until) helper used by
--    /api/cron/refresh-provider-analytics.

-- ─── provider_analytics_by_service RPC ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.provider_analytics_by_service(
  p_provider_id uuid,
  p_from        timestamptz DEFAULT '-infinity'::timestamptz,
  p_to          timestamptz DEFAULT 'infinity'::timestamptz,
  p_location_id uuid        DEFAULT NULL
)
RETURNS TABLE (
  offering_id      uuid,
  offering_title   text,
  booking_count    bigint,
  revenue          numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    o.id                               AS offering_id,
    COALESCE(o.title, 'Service')       AS offering_title,
    COUNT(DISTINCT bs.booking_id)      AS booking_count,
    COALESCE(SUM(bs.price), 0)::numeric AS revenue
  FROM public.booking_services bs
  JOIN public.bookings b ON b.id = bs.booking_id
  JOIN public.offerings o ON o.id = bs.offering_id
  WHERE b.provider_id = p_provider_id
    AND o.provider_id = p_provider_id
    AND b.created_at >= p_from
    AND b.created_at <  p_to
    AND (p_location_id IS NULL OR b.location_id = p_location_id)
  GROUP BY o.id, o.title
  ORDER BY revenue DESC NULLS LAST
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.provider_analytics_by_service(uuid, timestamptz, timestamptz, uuid)
  TO authenticated, service_role;

-- ─── provider_analytics_daily rollup table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_analytics_daily (
  provider_id   uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  as_of         date NOT NULL,
  bookings      bigint NOT NULL DEFAULT 0,
  revenue       numeric NOT NULL DEFAULT 0,
  tips          numeric NOT NULL DEFAULT 0,
  refunds       numeric NOT NULL DEFAULT 0,
  cancellation_fees numeric NOT NULL DEFAULT 0,
  platform_fees numeric NOT NULL DEFAULT 0,
  refreshed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, as_of)
);

CREATE INDEX IF NOT EXISTS idx_provider_analytics_daily_as_of
  ON public.provider_analytics_daily (as_of DESC);

ALTER TABLE public.provider_analytics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_analytics_daily_read ON public.provider_analytics_daily;
CREATE POLICY provider_analytics_daily_read
  ON public.provider_analytics_daily
  FOR SELECT
  TO authenticated
  USING (
    -- Provider owner
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_analytics_daily.provider_id
        AND p.user_id = auth.uid()
    )
    -- Provider staff
    OR EXISTS (
      SELECT 1 FROM public.provider_staff ps
      WHERE ps.provider_id = provider_analytics_daily.provider_id
        AND ps.user_id = auth.uid()
    )
    -- Superadmin or reporting-capable admin role
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('superadmin', 'admin_finance', 'admin_operations')
    )
  );

-- ─── refresh function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_provider_analytics_daily(
  p_since date DEFAULT (CURRENT_DATE - INTERVAL '7 days')::date,
  p_until date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  WITH daily AS (
    SELECT
      b.provider_id,
      (b.created_at AT TIME ZONE 'UTC')::date AS as_of,
      COUNT(*)                               AS bookings,
      COALESCE(SUM(b.total_amount), 0)       AS revenue
    FROM public.bookings b
    WHERE (b.created_at AT TIME ZONE 'UTC')::date BETWEEN p_since AND p_until
      AND b.status IN ('confirmed', 'completed', 'checked_in', 'in_progress')
    GROUP BY b.provider_id, (b.created_at AT TIME ZONE 'UTC')::date
  ),
  finance AS (
    SELECT
      ft.provider_id,
      (ft.created_at AT TIME ZONE 'UTC')::date AS as_of,
      COALESCE(SUM(CASE WHEN ft.transaction_type = 'tip' THEN ABS(ft.amount) ELSE 0 END), 0) AS tips,
      COALESCE(SUM(CASE WHEN ft.transaction_type = 'refund' THEN ABS(ft.amount) ELSE 0 END), 0) AS refunds,
      COALESCE(SUM(CASE WHEN ft.transaction_type = 'cancellation_fee' THEN ABS(ft.amount) ELSE 0 END), 0) AS cancellation_fees,
      COALESCE(SUM(CASE WHEN ft.transaction_type = 'payment' THEN ABS(COALESCE(ft.net, 0)) ELSE 0 END), 0) AS platform_fees
    FROM public.finance_transactions ft
    WHERE (ft.created_at AT TIME ZONE 'UTC')::date BETWEEN p_since AND p_until
    GROUP BY ft.provider_id, (ft.created_at AT TIME ZONE 'UTC')::date
  ),
  merged AS (
    SELECT
      COALESCE(d.provider_id, f.provider_id) AS provider_id,
      COALESCE(d.as_of, f.as_of)             AS as_of,
      COALESCE(d.bookings, 0)                AS bookings,
      COALESCE(d.revenue, 0)                 AS revenue,
      COALESCE(f.tips, 0)                    AS tips,
      COALESCE(f.refunds, 0)                 AS refunds,
      COALESCE(f.cancellation_fees, 0)       AS cancellation_fees,
      COALESCE(f.platform_fees, 0)           AS platform_fees
    FROM daily d
    FULL OUTER JOIN finance f
      ON f.provider_id = d.provider_id AND f.as_of = d.as_of
  )
  INSERT INTO public.provider_analytics_daily AS pad (
    provider_id, as_of, bookings, revenue, tips, refunds,
    cancellation_fees, platform_fees, refreshed_at
  )
  SELECT provider_id, as_of, bookings, revenue, tips, refunds,
         cancellation_fees, platform_fees, now()
  FROM merged
  WHERE provider_id IS NOT NULL
  ON CONFLICT (provider_id, as_of) DO UPDATE
    SET bookings          = EXCLUDED.bookings,
        revenue           = EXCLUDED.revenue,
        tips              = EXCLUDED.tips,
        refunds           = EXCLUDED.refunds,
        cancellation_fees = EXCLUDED.cancellation_fees,
        platform_fees     = EXCLUDED.platform_fees,
        refreshed_at      = EXCLUDED.refreshed_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_provider_analytics_daily(date, date)
  TO service_role;

COMMENT ON FUNCTION public.provider_analytics_by_service IS
  'F8: Per-offering bookings + revenue aggregate for provider analytics dashboards. Replaces app-side .limit(1000) scans.';
COMMENT ON TABLE public.provider_analytics_daily IS
  'F8: Nightly roll-up of bookings/revenue/tips/refunds/fees per provider+date. Refreshed by /api/cron/refresh-provider-analytics.';
