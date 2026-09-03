-- 877: Part M operational efficiency
--   1. ads_events_daily rollup table + rollup/purge function (retention for ads_events)
--   2. notification_delivery_queue purge function (delivered > 7d, dead-letter > 30d)
--   3. provider_dashboard_snapshot RPC — Postgres-side aggregates for the provider
--      dashboard (booking status tiles, schedule counts, recognized-revenue windows)
--      so the Node path no longer has to page up to 50k booking rows per request.
--
-- NOTE: the Supabase migration runner wraps this file in a transaction, so
-- CREATE INDEX CONCURRENTLY is not available (plain CREATE INDEX IF NOT EXISTS).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ads_events_daily (per provider / campaign / event_type / civil day, UTC)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ads_events_daily (
  day          date NOT NULL,
  provider_id  uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  -- campaign_id is nullable on ads_events (ON DELETE SET NULL); use a sentinel
  -- in the unique key so ON CONFLICT works for unattributed events.
  campaign_id  uuid NULL REFERENCES public.ads_campaigns(id) ON DELETE SET NULL,
  campaign_key uuid NOT NULL GENERATED ALWAYS AS (
    COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  event_type   text NOT NULL CHECK (event_type IN ('impression', 'click', 'book')),
  event_count  bigint NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ads_events_daily_key
  ON public.ads_events_daily (provider_id, campaign_key, event_type, day);

CREATE INDEX IF NOT EXISTS idx_ads_events_daily_provider_day
  ON public.ads_events_daily (provider_id, day DESC);

ALTER TABLE public.ads_events_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can manage ads_events_daily" ON public.ads_events_daily;
CREATE POLICY "Superadmins can manage ads_events_daily"
  ON public.ads_events_daily FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

DROP POLICY IF EXISTS "Providers can read own ads_events_daily" ON public.ads_events_daily;
CREATE POLICY "Providers can read own ads_events_daily"
  ON public.ads_events_daily FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = ads_events_daily.provider_id AND p.user_id = auth.uid()
    )
  );

-- Purge scan support (existing index is (provider_id, created_at DESC)).
CREATE INDEX IF NOT EXISTS idx_ads_events_created_at
  ON public.ads_events (created_at);

-- Roll the oldest raw ads_events (created_at < p_before) into ads_events_daily and
-- delete them, in one transaction, bounded by p_batch_limit rows per call. The cron
-- (purge-ads-events) loops until 0 rows are returned or its time budget is spent.
CREATE OR REPLACE FUNCTION public.rollup_and_purge_ads_events(
  p_before timestamptz,
  p_batch_limit int DEFAULT 20000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted bigint := 0;
  v_upserted bigint := 0;
BEGIN
  IF p_batch_limit IS NULL OR p_batch_limit <= 0 THEN
    p_batch_limit := 20000;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_ads_events_batch (id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE tmp_ads_events_batch;

  INSERT INTO tmp_ads_events_batch (id)
  SELECT e.id
  FROM public.ads_events e
  WHERE e.created_at < p_before
  ORDER BY e.created_at ASC
  LIMIT p_batch_limit;

  WITH agg AS (
    SELECT
      (e.created_at AT TIME ZONE 'UTC')::date AS day,
      e.provider_id,
      e.campaign_id,
      e.event_type,
      COUNT(*)::bigint AS event_count
    FROM public.ads_events e
    JOIN tmp_ads_events_batch b ON b.id = e.id
    GROUP BY 1, 2, 3, 4
  ),
  up AS (
    INSERT INTO public.ads_events_daily AS d (day, provider_id, campaign_id, event_type, event_count, updated_at)
    SELECT day, provider_id, campaign_id, event_type, event_count, now()
    FROM agg
    ON CONFLICT (provider_id, campaign_key, event_type, day)
    DO UPDATE SET
      event_count = d.event_count + EXCLUDED.event_count,
      updated_at = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_upserted FROM up;

  DELETE FROM public.ads_events e
  USING tmp_ads_events_batch b
  WHERE e.id = b.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'daily_rows_upserted', v_upserted,
    'before', p_before
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rollup_and_purge_ads_events(timestamptz, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollup_and_purge_ads_events(timestamptz, int) FROM anon;
REVOKE ALL ON FUNCTION public.rollup_and_purge_ads_events(timestamptz, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_and_purge_ads_events(timestamptz, int) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. notification_delivery_queue retention
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notification_delivery_queue_status_updated_at
  ON public.notification_delivery_queue (status, updated_at);

CREATE OR REPLACE FUNCTION public.purge_notification_delivery_queue(
  p_delivered_before timestamptz,
  p_dead_letter_before timestamptz,
  p_batch_limit int DEFAULT 20000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivered bigint := 0;
  v_dead_letter bigint := 0;
BEGIN
  IF p_batch_limit IS NULL OR p_batch_limit <= 0 THEN
    p_batch_limit := 20000;
  END IF;

  WITH victims AS (
    SELECT id
    FROM public.notification_delivery_queue
    WHERE status = 'delivered'
      AND COALESCE(delivered_at, updated_at) < p_delivered_before
    ORDER BY COALESCE(delivered_at, updated_at) ASC
    LIMIT p_batch_limit
  ),
  del AS (
    DELETE FROM public.notification_delivery_queue q
    USING victims v
    WHERE q.id = v.id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_delivered FROM del;

  WITH victims AS (
    SELECT id
    FROM public.notification_delivery_queue
    WHERE status = 'dead_letter'
      AND COALESCE(dead_lettered_at, updated_at) < p_dead_letter_before
    ORDER BY COALESCE(dead_lettered_at, updated_at) ASC
    LIMIT p_batch_limit
  ),
  del AS (
    DELETE FROM public.notification_delivery_queue q
    USING victims v
    WHERE q.id = v.id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_dead_letter FROM del;

  RETURN jsonb_build_object(
    'delivered_deleted', v_delivered,
    'dead_letter_deleted', v_dead_letter
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_notification_delivery_queue(timestamptz, timestamptz, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_notification_delivery_queue(timestamptz, timestamptz, int) FROM anon;
REVOKE ALL ON FUNCTION public.purge_notification_delivery_queue(timestamptz, timestamptz, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_notification_delivery_queue(timestamptz, timestamptz, int) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. provider_dashboard_snapshot(p_provider_id, p_location_id, p_tz)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Mirrors apps/web/src/lib/server/provider/get-provider-dashboard.ts (Node path) and
-- apps/web/src/lib/reports/provider-revenue-semantics.ts:
--
--   * Recognized revenue = SUM(COALESCE(net, amount, 0)) over RECOGNIZED_REVENUE_TYPES
--     (provider_earnings, membership_provider_earnings, tip, travel_fee,
--     cancellation_fee, walk_in_additional_charge), by finance_transactions.created_at.
--   * Windows are civil days in the provider timezone (p_tz); week starts Sunday
--     (JS Date#getDay()). Revenue today/week/month all END at end-of-today;
--     schedule (appointments) week/month cover the FULL calendar period (upcoming).
--   * "yesterday" = previous civil day; "prior_week" = last week, same elapsed days;
--     "prior_month" = last month 1st → same civil day (month-end clamped like date-fns).
--   * Branch scope (p_location_id): bookings at the branch, at-home bookings with no
--     branch, and walk-ins with no branch (dashboardBookingLocationOrFilter). Ledger
--     rows follow their booking (precedence) or product order (collection branch, or
--     primary salon for deliveries); unattributed provider-level rows are EXCLUDED
--     when scoped (resolveLedgerLocationScope default).
--
-- The TS parity fixture lives in
-- apps/web/src/lib/server/provider/__tests__/dashboard-snapshot-parity.test.ts.

CREATE OR REPLACE FUNCTION public.provider_dashboard_snapshot(
  p_provider_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_tz text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz text := COALESCE(NULLIF(btrim(p_tz), ''), 'UTC');
  v_local_now timestamp;
  v_dow int;

  -- civil (local) window edges, timestamp without time zone
  l_today_start timestamp;
  l_today_end timestamp;
  l_week_start timestamp;
  l_week_end timestamp;
  l_month_start timestamp;
  l_month_end timestamp;
  l_last_month_start timestamp;
  l_yesterday_start timestamp;
  l_prior_week_start timestamp;
  l_prior_week_end timestamp;
  l_prior_month_mtd_end timestamp;

  -- UTC (timestamptz) window edges; *_end are EXCLUSIVE
  u_today_start timestamptz;
  u_today_end timestamptz;
  u_week_start timestamptz;
  u_week_end timestamptz;
  u_month_start timestamptz;
  u_month_end timestamptz;
  u_last_month_start timestamptz;
  u_yesterday_start timestamptz;
  u_prior_week_start timestamptz;
  u_prior_week_end timestamptz;
  u_prior_month_mtd_start timestamptz;
  u_prior_month_mtd_end timestamptz;

  v_primary_location_id uuid;
  v_bookings jsonb;
  v_schedule jsonb;
  v_revenue jsonb;
BEGIN
  BEGIN
    v_local_now := now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
    v_local_now := now() AT TIME ZONE 'UTC';
  END;

  v_dow := EXTRACT(dow FROM v_local_now)::int; -- 0 = Sunday (matches JS getDay())

  l_today_start := date_trunc('day', v_local_now);
  l_today_end := l_today_start + interval '1 day';
  l_week_start := l_today_start - make_interval(days => v_dow);
  l_week_end := l_week_start + interval '7 days';
  l_month_start := date_trunc('month', v_local_now);
  l_month_end := l_month_start + interval '1 month';
  l_last_month_start := l_month_start - interval '1 month';
  l_yesterday_start := l_today_start - interval '1 day';
  l_prior_week_start := l_week_start - interval '7 days';
  -- same number of elapsed days as the current partial week (week start → today, inclusive)
  l_prior_week_end := l_prior_week_start + make_interval(days => v_dow + 1);
  -- date-fns subMonths clamps to month end (Mar 31 → Feb 28); so does Postgres interval math
  l_prior_month_mtd_end := date_trunc('day', v_local_now - interval '1 month') + interval '1 day';

  u_today_start := l_today_start AT TIME ZONE v_tz;
  u_today_end := l_today_end AT TIME ZONE v_tz;
  u_week_start := l_week_start AT TIME ZONE v_tz;
  u_week_end := l_week_end AT TIME ZONE v_tz;
  u_month_start := l_month_start AT TIME ZONE v_tz;
  u_month_end := l_month_end AT TIME ZONE v_tz;
  u_last_month_start := l_last_month_start AT TIME ZONE v_tz;
  u_yesterday_start := l_yesterday_start AT TIME ZONE v_tz;
  u_prior_week_start := l_prior_week_start AT TIME ZONE v_tz;
  u_prior_week_end := l_prior_week_end AT TIME ZONE v_tz;
  u_prior_month_mtd_start := u_last_month_start;
  u_prior_month_mtd_end := l_prior_month_mtd_end AT TIME ZONE v_tz;

  IF p_location_id IS NOT NULL THEN
    SELECT pl.id INTO v_primary_location_id
    FROM public.provider_locations pl
    WHERE pl.provider_id = p_provider_id
      AND pl.is_active = true
      AND pl.location_type = 'salon'
    ORDER BY pl.is_primary DESC, pl.created_at ASC
    LIMIT 1;
  END IF;

  -- Booking status tiles + schedule counts ------------------------------------
  WITH scoped AS (
    SELECT
      b.id,
      b.status::text AS status,
      b.scheduled_at,
      b.location_type::text AS location_type
    FROM public.bookings b
    WHERE b.provider_id = p_provider_id
      AND (
        p_location_id IS NULL
        OR b.location_id = p_location_id
        OR (b.location_id IS NULL AND b.location_type::text = 'at_home')
        OR (b.location_id IS NULL AND b.booking_source::text = 'walk_in')
      )
  ),
  agg AS (
    SELECT
      COUNT(*) AS total_bookings,
      COUNT(*) FILTER (WHERE status IN ('pending','pending_payment','confirmed','waiting','checked_in','in_progress')) AS active_bookings,
      COUNT(*) FILTER (WHERE status IN ('confirmed','waiting','checked_in')) AS confirmed_bookings,
      COUNT(*) FILTER (WHERE status IN ('pending','pending_payment')) AS pending_bookings,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed_bookings,
      COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_bookings,
      COUNT(*) FILTER (WHERE status = 'no_show') AS no_show_bookings,
      COUNT(*) FILTER (WHERE location_type = 'at_home') AS at_home_bookings,
      COUNT(*) FILTER (WHERE location_type = 'at_salon') AS at_salon_bookings,
      COUNT(*) FILTER (WHERE location_type = 'at_home' AND status = 'completed') AS at_home_completed,
      COUNT(*) FILTER (WHERE location_type = 'at_salon' AND status = 'completed') AS at_salon_completed,
      COUNT(*) FILTER (WHERE location_type = 'at_home' AND status IN ('confirmed','waiting','checked_in')) AS at_home_confirmed,
      COUNT(*) FILTER (WHERE location_type = 'at_salon' AND status IN ('confirmed','waiting','checked_in')) AS at_salon_confirmed,
      COUNT(*) FILTER (WHERE location_type = 'at_home' AND status IN ('pending','pending_payment')) AS at_home_pending,
      COUNT(*) FILTER (WHERE location_type = 'at_salon' AND status IN ('pending','pending_payment')) AS at_salon_pending,
      COUNT(*) FILTER (WHERE location_type = 'at_home' AND status = 'cancelled') AS at_home_cancelled,
      COUNT(*) FILTER (WHERE location_type = 'at_salon' AND status = 'cancelled') AS at_salon_cancelled,
      COUNT(*) FILTER (WHERE location_type = 'at_home' AND status = 'no_show') AS at_home_no_show,
      COUNT(*) FILTER (WHERE location_type = 'at_salon' AND status = 'no_show') AS at_salon_no_show,
      -- schedule counts: scheduled_at within window AND status in SCHEDULE_COUNT_STATUSES
      COUNT(*) FILTER (WHERE scheduled_at >= u_today_start AND scheduled_at < u_today_end
        AND status IN ('pending','pending_payment','confirmed','waiting','checked_in','in_progress','completed')) AS appointments_today,
      COUNT(*) FILTER (WHERE scheduled_at >= u_week_start AND scheduled_at < u_week_end
        AND status IN ('pending','pending_payment','confirmed','waiting','checked_in','in_progress','completed')) AS appointments_this_week,
      COUNT(*) FILTER (WHERE scheduled_at >= u_month_start AND scheduled_at < u_month_end
        AND status IN ('pending','pending_payment','confirmed','waiting','checked_in','in_progress','completed')) AS appointments_this_month,
      COUNT(*) FILTER (WHERE scheduled_at >= u_yesterday_start AND scheduled_at < u_today_start
        AND status IN ('pending','pending_payment','confirmed','waiting','checked_in','in_progress','completed')) AS appointments_yesterday,
      COUNT(*) FILTER (WHERE scheduled_at >= u_prior_week_start AND scheduled_at < u_prior_week_end
        AND status IN ('pending','pending_payment','confirmed','waiting','checked_in','in_progress','completed')) AS appointments_prior_week,
      COUNT(*) FILTER (WHERE scheduled_at >= u_prior_month_mtd_start AND scheduled_at < u_prior_month_mtd_end
        AND status IN ('pending','pending_payment','confirmed','waiting','checked_in','in_progress','completed')) AS appointments_prior_month
    FROM scoped
  )
  SELECT
    jsonb_build_object(
      'total_bookings', total_bookings,
      'active_bookings', active_bookings,
      'confirmed_bookings', confirmed_bookings,
      'pending_bookings', pending_bookings,
      'completed_bookings', completed_bookings,
      'cancelled_bookings', cancelled_bookings,
      'no_show_bookings', no_show_bookings,
      'at_home_bookings', at_home_bookings,
      'at_salon_bookings', at_salon_bookings,
      'at_home_completed', at_home_completed,
      'at_salon_completed', at_salon_completed,
      'at_home_confirmed', at_home_confirmed,
      'at_salon_confirmed', at_salon_confirmed,
      'at_home_pending', at_home_pending,
      'at_salon_pending', at_salon_pending,
      'at_home_cancelled', at_home_cancelled,
      'at_salon_cancelled', at_salon_cancelled,
      'at_home_no_show', at_home_no_show,
      'at_salon_no_show', at_salon_no_show
    ),
    jsonb_build_object(
      'today', appointments_today,
      'this_week', appointments_this_week,
      'this_month', appointments_this_month,
      'yesterday', appointments_yesterday,
      'prior_week', appointments_prior_week,
      'prior_month', appointments_prior_month
    )
  INTO v_bookings, v_schedule
  FROM agg;

  -- Recognized revenue windows -------------------------------------------------
  WITH ledger AS (
    SELECT
      ft.created_at,
      COALESCE(ft.net, ft.amount, 0)::numeric AS net
    FROM public.finance_transactions ft
    LEFT JOIN public.bookings b
      ON p_location_id IS NOT NULL AND b.id = ft.booking_id
    LEFT JOIN public.product_orders po
      ON p_location_id IS NOT NULL AND ft.booking_id IS NULL AND po.id = ft.product_order_id
    WHERE ft.provider_id = p_provider_id
      AND ft.transaction_type IN (
        'provider_earnings', 'membership_provider_earnings', 'tip',
        'travel_fee', 'cancellation_fee', 'walk_in_additional_charge'
      )
      AND ft.created_at >= u_last_month_start  -- earliest window edge
      AND ft.created_at < u_today_end
      AND (
        p_location_id IS NULL
        OR (
          ft.booking_id IS NOT NULL
          AND b.id IS NOT NULL
          AND b.provider_id = p_provider_id
          AND (
            b.location_id = p_location_id
            OR (b.location_id IS NULL AND b.location_type::text = 'at_home')
            OR (b.location_id IS NULL AND b.booking_source::text = 'walk_in')
          )
        )
        OR (
          ft.booking_id IS NULL
          AND ft.product_order_id IS NOT NULL
          AND po.id IS NOT NULL
          AND po.provider_id = p_provider_id
          AND COALESCE(
            po.collection_location_id,
            CASE WHEN po.fulfillment_type::text = 'delivery' THEN v_primary_location_id END
          ) = p_location_id
        )
      )
  )
  SELECT jsonb_build_object(
    'today', COALESCE(SUM(net) FILTER (WHERE created_at >= u_today_start AND created_at < u_today_end), 0),
    'this_week', COALESCE(SUM(net) FILTER (WHERE created_at >= u_week_start AND created_at < u_today_end), 0),
    'this_month', COALESCE(SUM(net) FILTER (WHERE created_at >= u_month_start AND created_at < u_today_end), 0),
    'last_month', COALESCE(SUM(net) FILTER (WHERE created_at >= u_last_month_start AND created_at < u_month_start), 0),
    'yesterday', COALESCE(SUM(net) FILTER (WHERE created_at >= u_yesterday_start AND created_at < u_today_start), 0),
    'prior_week', COALESCE(SUM(net) FILTER (WHERE created_at >= u_prior_week_start AND created_at < u_prior_week_end), 0),
    'prior_month', COALESCE(SUM(net) FILTER (WHERE created_at >= u_prior_month_mtd_start AND created_at < u_prior_month_mtd_end), 0)
  )
  INTO v_revenue
  FROM ledger;

  RETURN jsonb_build_object(
    'version', 1,
    'generated_at', now(),
    'tz', v_tz,
    'provider_id', p_provider_id,
    'location_id', p_location_id,
    'bookings', v_bookings,
    'schedule', v_schedule,
    'revenue', v_revenue,
    'windows', jsonb_build_object(
      'today', jsonb_build_object('start', u_today_start, 'end', u_today_end),
      'this_week', jsonb_build_object('start', u_week_start, 'end', u_week_end),
      'this_month', jsonb_build_object('start', u_month_start, 'end', u_month_end),
      'last_month', jsonb_build_object('start', u_last_month_start, 'end', u_month_start),
      'yesterday', jsonb_build_object('start', u_yesterday_start, 'end', u_today_start),
      'prior_week', jsonb_build_object('start', u_prior_week_start, 'end', u_prior_week_end),
      'prior_month', jsonb_build_object('start', u_prior_month_mtd_start, 'end', u_prior_month_mtd_end)
    )
  );
END;
$$;

-- SECURITY DEFINER bypasses RLS: only the server-side service role may call this
-- (the API layer resolves provider membership before calling).
REVOKE ALL ON FUNCTION public.provider_dashboard_snapshot(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_dashboard_snapshot(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.provider_dashboard_snapshot(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provider_dashboard_snapshot(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.provider_dashboard_snapshot(uuid, uuid, text) IS
  'Provider dashboard aggregates (status tiles, schedule counts, recognized-revenue windows) computed in Postgres. Enabled in the app via DASHBOARD_SNAPSHOT_RPC=1.';
