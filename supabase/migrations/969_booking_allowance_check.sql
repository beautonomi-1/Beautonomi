-- Booking allowance matches the published Starter line: "50 online bookings per month".
-- Walk-in and provider-created appointments are not part of that cap.
-- booking_source defaults to 'online', so a null source counts as online.
-- Feature JSON is read as text so a non-numeric cap cannot abort the check.

CREATE OR REPLACE FUNCTION public.count_provider_bookings_this_month(provider_id_param uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(COUNT(*)::integer, 0)
  FROM public.bookings AS b
  WHERE b.provider_id = provider_id_param
    AND b.status <> 'cancelled'
    AND b.payment_status IS DISTINCT FROM 'refunded'
    AND COALESCE(b.booking_source, 'online') = 'online'
    AND b.created_at >= date_trunc('month', CURRENT_DATE)
    AND b.created_at < date_trunc('month', CURRENT_DATE) + interval '1 month';
$$;

COMMENT ON FUNCTION public.count_provider_bookings_this_month(uuid) IS
  'Online bookings created this calendar month. Excludes cancelled appointments and payment_status refunded. Null booking_source counts as online (column default).';

CREATE OR REPLACE FUNCTION public.can_provider_create_booking(provider_id_param uuid)
RETURNS TABLE (
  can_create boolean,
  reason text,
  current_count integer,
  limit_value integer,
  plan_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_name text;
  v_features jsonb;
  v_column_max integer;
  v_enabled_text text;
  v_max_text text;
  v_max integer;
  v_count integer;
BEGIN
  SELECT picked.out_name, picked.out_features, picked.out_max
    INTO v_name, v_features, v_column_max
  FROM (
    SELECT
      gp.plan_name AS out_name,
      gp.features AS out_features,
      gp.max_bookings_per_month AS out_max
    FROM public.get_provider_subscription_plan(provider_id_param) AS gp
    LIMIT 1
  ) AS picked;

  IF NOT FOUND THEN
    can_create := false;
    reason := 'No active subscription plan';
    current_count := 0;
    limit_value := 0;
    plan_name := '';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Catalog: Starter sets enabled=true and max 50. Growth and Scale set enabled=false (no cap).
  v_enabled_text := lower(btrim(COALESCE(v_features #>> '{booking_limits,enabled}', 'false')));
  IF v_enabled_text NOT IN ('true', 't', '1', 'yes', 'on') THEN
    can_create := true;
    reason := 'Booking limits not enabled for this plan';
    current_count := 0;
    limit_value := NULL;
    plan_name := COALESCE(v_name, '');
    RETURN NEXT;
    RETURN;
  END IF;

  v_max_text := btrim(COALESCE(v_features #>> '{booking_limits,max_bookings_per_month}', ''));
  IF v_max_text ~ '^[0-9]+$' THEN
    v_max := v_max_text::integer;
  ELSE
    v_max := v_column_max;
  END IF;

  IF v_max IS NULL THEN
    can_create := true;
    reason := 'Unlimited bookings';
    current_count := 0;
    limit_value := NULL;
    plan_name := COALESCE(v_name, '');
    RETURN NEXT;
    RETURN;
  END IF;

  v_count := public.count_provider_bookings_this_month(provider_id_param);

  IF v_count >= v_max THEN
    can_create := false;
    reason := format(
      'Monthly booking limit reached (%s/%s). Upgrade your plan to continue.',
      v_count,
      v_max
    );
    current_count := v_count;
    limit_value := v_max;
    plan_name := COALESCE(v_name, '');
    RETURN NEXT;
    RETURN;
  END IF;

  can_create := true;
  reason := format('Bookings remaining: %s/%s', v_max - v_count, v_max);
  current_count := v_count;
  limit_value := v_max;
  plan_name := COALESCE(v_name, '');
  RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION public.can_provider_create_booking(uuid) IS
  'Whether this provider can take another online booking this month. booking_limits.enabled false means no monthly cap.';

REVOKE ALL ON FUNCTION public.count_provider_bookings_this_month(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_provider_create_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_provider_bookings_this_month(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.can_provider_create_booking(uuid) TO service_role, authenticated;
