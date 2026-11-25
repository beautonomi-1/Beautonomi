-- The public anon key could read every column of an active salon, staff
-- member, and location because row policies allow the row and the table
-- grant allows every column. Home, search, and the public profile use the
-- service role and already omit these fields. Authenticated keeps the table
-- grant, so a salon owner or staff member reading their own row still sees
-- phone, email, and pay.

CREATE OR REPLACE FUNCTION pg_temp.restrict_anon_select(p_table text, p_deny text[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table
    AND NOT (c.column_name = ANY (p_deny));

  IF cols IS NULL OR length(cols) = 0 THEN
    RAISE EXCEPTION 'anon select allow-list for % is empty', p_table;
  END IF;

  -- Direct anon grant and any grant via PUBLIC. authenticated is untouched.
  EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM PUBLIC, anon', p_table);
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.%I TO anon', cols, p_table);
END;
$$;

SELECT pg_temp.restrict_anon_select(
  'providers',
  ARRAY[
    'phone',
    'email',
    'user_id',
    'total_paid_out',
    'total_earnings',
    'subscription_plan_id',
    'subscription_status',
    'subscription_expires_at',
    'commission_override',
    'stripe_connect_account_id',
    'vat_number',
    'is_vat_registered',
    'tax_rate_override_percent',
    'tax_rate_override_by',
    'tax_rate_override_at',
    'tax_rate_override_reason'
  ]
);

SELECT pg_temp.restrict_anon_select(
  'provider_staff',
  ARRAY[
    'phone',
    'email',
    'user_id',
    'time_clock_pin',
    'commission_percentage',
    'commission_enabled',
    'commission_rate',
    'service_commission_rate',
    'product_commission_rate',
    'hourly_rate',
    'salary'
  ]
);

-- Salon phone stays available through the profile API (service role), which
-- already withholds it until the viewer has a booking. The public key does not
-- need the column.
SELECT pg_temp.restrict_anon_select('provider_locations', ARRAY['phone']);

-- Sums one salon's earnings for any id. Called from other database functions,
-- not from the apps. Anon must not be able to invoke it. authenticated keeps
-- EXECUTE so a salon update that runs the gamification trigger still can.
REVOKE ALL ON FUNCTION public.get_provider_recognized_earnings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_recognized_earnings(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF has_column_privilege('anon', 'public.providers', 'phone', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read providers.phone';
  END IF;
  IF has_column_privilege('anon', 'public.providers', 'total_paid_out', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read providers.total_paid_out';
  END IF;
  IF has_column_privilege('anon', 'public.providers', 'stripe_connect_account_id', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read providers.stripe_connect_account_id';
  END IF;
  IF NOT has_column_privilege('anon', 'public.providers', 'slug', 'SELECT') THEN
    RAISE EXCEPTION 'anon lost providers.slug';
  END IF;
  IF NOT has_column_privilege('anon', 'public.providers', 'business_name', 'SELECT') THEN
    RAISE EXCEPTION 'anon lost providers.business_name';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.providers', 'phone', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost providers.phone';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.providers', 'email', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost providers.email';
  END IF;

  IF has_column_privilege('anon', 'public.provider_staff', 'phone', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read provider_staff.phone';
  END IF;
  IF has_column_privilege('anon', 'public.provider_staff', 'email', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read provider_staff.email';
  END IF;
  IF has_column_privilege('anon', 'public.provider_staff', 'time_clock_pin', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read provider_staff.time_clock_pin';
  END IF;
  IF has_column_privilege('anon', 'public.provider_staff', 'salary', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read provider_staff.salary';
  END IF;
  IF NOT has_column_privilege('anon', 'public.provider_staff', 'name', 'SELECT') THEN
    RAISE EXCEPTION 'anon lost provider_staff.name';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.provider_staff', 'phone', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost provider_staff.phone';
  END IF;

  IF has_column_privilege('anon', 'public.provider_locations', 'phone', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read provider_locations.phone';
  END IF;
  IF NOT has_column_privilege('anon', 'public.provider_locations', 'city', 'SELECT') THEN
    RAISE EXCEPTION 'anon lost provider_locations.city';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.provider_locations', 'phone', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost provider_locations.phone';
  END IF;

  IF has_function_privilege('anon', 'public.get_provider_recognized_earnings(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can still execute get_provider_recognized_earnings';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_provider_recognized_earnings(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated lost get_provider_recognized_earnings';
  END IF;
END $$;
