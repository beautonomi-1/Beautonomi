-- F25 — Reporting materialised views.
--
-- Three materialised views to keep admin/provider dashboards fast and
-- predictable even as transaction volume grows. All three are refreshed
-- together by the `/api/cron/refresh-reports` cron job via
-- `refresh_reporting_views()`.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.provider_dashboard_daily AS
SELECT
  b.provider_id,
  (b.created_at AT TIME ZONE 'UTC')::date AS as_of,
  COUNT(*)                                 AS bookings,
  COUNT(*) FILTER (WHERE b.status = 'confirmed')   AS confirmed_bookings,
  COUNT(*) FILTER (WHERE b.status = 'cancelled')   AS cancelled_bookings,
  COUNT(*) FILTER (WHERE b.status = 'completed')   AS completed_bookings,
  COUNT(DISTINCT b.customer_id)            AS unique_customers,
  COALESCE(SUM(b.total_amount), 0)         AS gross_revenue
FROM public.bookings b
GROUP BY b.provider_id, (b.created_at AT TIME ZONE 'UTC')::date;

CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_dashboard_daily
  ON public.provider_dashboard_daily (provider_id, as_of);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.admin_finance_daily AS
SELECT
  (ft.created_at AT TIME ZONE 'UTC')::date AS as_of,
  ft.transaction_type,
  COUNT(*)                                 AS tx_count,
  COALESCE(SUM(ft.amount), 0)              AS amount_total,
  COALESCE(SUM(ft.net), 0)                 AS net_total
FROM public.finance_transactions ft
GROUP BY (ft.created_at AT TIME ZONE 'UTC')::date, ft.transaction_type;

CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_finance_daily
  ON public.admin_finance_daily (as_of, transaction_type);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.admin_bookings_daily AS
SELECT
  (b.created_at AT TIME ZONE 'UTC')::date AS as_of,
  b.status,
  COUNT(*)                                 AS bookings,
  COUNT(DISTINCT b.provider_id)            AS providers_with_bookings,
  COUNT(DISTINCT b.customer_id)            AS unique_customers,
  COALESCE(SUM(b.total_amount), 0)         AS gross_revenue
FROM public.bookings b
GROUP BY (b.created_at AT TIME ZONE 'UTC')::date, b.status;

CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_bookings_daily
  ON public.admin_bookings_daily (as_of, status);

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT SELECT ON public.provider_dashboard_daily TO authenticated, service_role;
GRANT SELECT ON public.admin_finance_daily      TO authenticated, service_role;
GRANT SELECT ON public.admin_bookings_daily     TO authenticated, service_role;

-- ─── Refresh helper ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_reporting_views()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.provider_dashboard_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.admin_finance_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.admin_bookings_daily;
  RETURN jsonb_build_object(
    'ok', true,
    'duration_ms', (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::bigint
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_reporting_views() TO service_role;

COMMENT ON MATERIALIZED VIEW public.provider_dashboard_daily IS
  'F25: per-provider per-day booking counters for provider dashboards.';
COMMENT ON MATERIALIZED VIEW public.admin_finance_daily IS
  'F25: per-day finance_transactions totals by type for admin finance dashboards.';
COMMENT ON MATERIALIZED VIEW public.admin_bookings_daily IS
  'F25: per-day booking counters by status for admin operations dashboards.';
COMMENT ON FUNCTION public.refresh_reporting_views() IS
  'F25: refreshes all admin/provider reporting matviews concurrently. Called by /api/cron/refresh-reports.';
