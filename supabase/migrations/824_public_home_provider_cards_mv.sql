-- Precomputed public home provider cards (location-independent sections).
-- Refreshed by refresh_reporting_views() alongside existing reporting MVs.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.public_home_top_rated AS
SELECT
  p.tenant_id,
  p.id AS provider_id,
  p.slug,
  p.business_name,
  p.rating_average,
  p.review_count,
  p.thumbnail_url,
  p.status,
  p.created_at,
  ROW_NUMBER() OVER (
    PARTITION BY p.tenant_id
    ORDER BY p.rating_average DESC NULLS LAST, p.review_count DESC NULLS LAST, p.created_at DESC
  ) AS rank_in_tenant
FROM public.providers p
WHERE p.status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS ux_public_home_top_rated
  ON public.public_home_top_rated (tenant_id, provider_id);

CREATE INDEX IF NOT EXISTS idx_public_home_top_rated_rank
  ON public.public_home_top_rated (tenant_id, rank_in_tenant);

GRANT SELECT ON public.public_home_top_rated TO authenticated, service_role;

-- "Hottest" ranking: the live route otherwise pulls up to 5000 booking rows per
-- cache miss and counts them in Node. The trailing window is evaluated at refresh
-- time, which matches the browse-content staleness budget.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.public_home_hottest AS
SELECT
  b.tenant_id,
  b.provider_id,
  COUNT(*) AS booking_count,
  ROW_NUMBER() OVER (
    PARTITION BY b.tenant_id
    ORDER BY COUNT(*) DESC, b.provider_id
  ) AS rank_in_tenant
FROM public.bookings b
JOIN public.providers p
  ON p.id = b.provider_id
 AND p.status = 'active'
 AND p.deleted_at IS NULL
WHERE b.created_at >= (now() - interval '30 days')
  AND b.status IN ('confirmed', 'completed', 'in_progress')
GROUP BY b.tenant_id, b.provider_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_public_home_hottest
  ON public.public_home_hottest (tenant_id, provider_id);

CREATE INDEX IF NOT EXISTS idx_public_home_hottest_rank
  ON public.public_home_hottest (tenant_id, rank_in_tenant);

-- Materialized views bypass RLS and booking volume per provider is competitive
-- data, so this one stays server-side only. The route reads it with the admin
-- client; the rare request-scoped fallback just uses the live query instead.
GRANT SELECT ON public.public_home_hottest TO service_role;

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
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.public_home_top_rated;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.public_home_hottest;
  RETURN jsonb_build_object(
    'ok', true,
    'duration_ms', (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::bigint
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
