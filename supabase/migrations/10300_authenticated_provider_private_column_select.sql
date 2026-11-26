-- Signed-in logins used table-level SELECT on active salon rows and could read
-- every column on another tenant. Revoke table SELECT from authenticated and grant
-- an allow-list, matching migration 10189 for anon. Deploy apps/web first.

CREATE OR REPLACE FUNCTION public.auth_user_provider_portal_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.providers WHERE user_id = uid LIMIT 1) THEN
    RETURN 'provider_owner';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.provider_staff
    WHERE user_id = uid AND is_active = true
    LIMIT 1
  ) THEN
    RETURN 'provider_staff';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.auth_user_provider_portal_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_provider_portal_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.provider_slug_should_noindex(p_slug text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(NOT u.include_in_search_engines, true)
  FROM public.providers p
  INNER JOIN public.users u ON u.id = p.user_id
  WHERE p.slug = p_slug AND p.status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.provider_slug_should_noindex(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_slug_should_noindex(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.restrict_authenticated_select(p_table text, p_deny text[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cols text;
  deny_filtered text[];
BEGIN
  SELECT array_agg(d ORDER BY d)
    INTO deny_filtered
  FROM unnest(p_deny) AS d
  WHERE EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = p_table
      AND c.column_name = d
  );

  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table
    AND NOT (c.column_name = ANY (COALESCE(deny_filtered, ARRAY[]::text[])));

  IF cols IS NULL OR length(cols) = 0 THEN
    RAISE EXCEPTION 'authenticated select allow-list for % is empty', p_table;
  END IF;

  EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM authenticated', p_table);
  EXECUTE format('GRANT SELECT (%s) ON TABLE public.%I TO authenticated', cols, p_table);
END;
$$;

SELECT pg_temp.restrict_authenticated_select(
  'providers',
  ARRAY[
    'phone',
    'email',
    'billing_phone',
    'billing_email',
    'billing_address',
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
    'tax_rate_override_reason',
    'registered_business_name',
    'business_registration_number',
    'business_registration_country',
    'owner_name'
  ]
);

SELECT pg_temp.restrict_authenticated_select(
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

SELECT pg_temp.restrict_authenticated_select('provider_locations', ARRAY['phone']);

DO $$
BEGIN
  IF NOT has_column_privilege('authenticated', 'public.providers', 'slug', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost providers.slug';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.provider_locations', 'city', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost provider_locations.city';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.provider_staff', 'name', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost provider_staff.name';
  END IF;

  IF has_column_privilege('authenticated', 'public.providers', 'phone', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated can still read providers.phone';
  END IF;
  IF has_column_privilege('authenticated', 'public.providers', 'stripe_connect_account_id', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated can still read providers.stripe_connect_account_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.providers', 'user_id', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated can still read providers.user_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.provider_staff', 'time_clock_pin', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated can still read provider_staff.time_clock_pin';
  END IF;
  IF has_column_privilege('authenticated', 'public.provider_staff', 'salary', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated can still read provider_staff.salary';
  END IF;
  IF has_column_privilege('authenticated', 'public.provider_locations', 'phone', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated can still read provider_locations.phone';
  END IF;

  IF has_column_privilege('anon', 'public.providers', 'phone', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read providers.phone';
  END IF;

  IF NOT has_column_privilege('service_role', 'public.providers', 'total_paid_out', 'SELECT') THEN
    RAISE EXCEPTION 'service_role lost providers.total_paid_out';
  END IF;
END $$;