-- 546_security_advisor_rls_and_invoker_views.sql
-- Clears Supabase Security Advisor findings without changing application-facing
-- view names or query shapes.

-- SECURITY DEFINER view lint:
-- Postgres 15+ supports security_invoker views. This preserves each view
-- definition while making permissions/RLS evaluate as the querying role.
DO $$
DECLARE
  view_name text;
  security_definer_views text[] := ARRAY[
    'services_with_variants',
    'providers_active',
    'offering_staff',
    'provider_staff_active',
    'users_active',
    'v_journal_entry_totals',
    'offerings_active',
    'user_adverse_finding_summary',
    'products_active',
    'v_ledger_reconciliation',
    'provider_locations_active',
    'loyalty_points_balance',
    'v_ledger_account_balances',
    'booking_holds_active',
    'service_addons'
  ];
BEGIN
  FOREACH view_name IN ARRAY security_definer_views LOOP
    IF to_regclass(format('public.%I', view_name)) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', view_name);
    END IF;
  END LOOP;
END $$;

-- PostGIS installs spatial_ref_sys as extension-owned reference metadata.
-- Supabase's advisor flags it only because it is a table in the exposed public
-- schema. Some PostGIS builds are not relocatable, so this block is best-effort:
-- move it only when the database supports that, otherwise keep the extension
-- untouched rather than risking geospatial features.
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

DO $$
DECLARE
  postgis_schema text;
BEGIN
  SELECT n.nspname
  INTO postgis_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'postgis';

  IF postgis_schema = 'public' THEN
    BEGIN
      ALTER EXTENSION postgis SET SCHEMA extensions;
    EXCEPTION
      WHEN feature_not_supported OR insufficient_privilege THEN
        RAISE NOTICE 'Leaving PostGIS in public because this database does not allow moving the extension schema.';
    END;
  END IF;
END $$;

-- Keep existing SECURITY DEFINER geospatial RPCs working after PostGIS leaves
-- public. Several of these functions intentionally set their own search_path.
DO $$
DECLARE
  function_signature text;
  geospatial_functions text[] := ARRAY[
    'public.compute_platform_zone_geometry(uuid)',
    'public.update_platform_zone_geometry(uuid)',
    'public.get_postal_areas_geometry_geojson(text,text[],text,text,text,double precision)',
    'public.st_asgeojson_zone_simplified(uuid,double precision)',
    'public.check_point_in_platform_zones(double precision,double precision)',
    'public.rebuild_postal_areas_from_stage(text,integer)',
    'public.insert_platform_zone_inclusions_from_custom_polygon(uuid,jsonb,integer)',
    'public.insert_platform_zone_exclusion_custom_polygon(uuid,jsonb)',
    'public.st_zone_geometry_fragment_count(uuid)',
    'public.st_asgeojson_zone_inclusions_union_simplified(uuid,double precision)',
    'public.st_asgeojson_zone_exclusions_union_simplified(uuid,double precision)',
    'public.auto_enroll_providers_for_zone(uuid)',
    'public.resolve_postal_areas_at_point(text,double precision,double precision,integer)'
  ];
BEGIN
  FOREACH function_signature IN ARRAY geospatial_functions LOOP
    IF to_regprocedure(function_signature) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', function_signature);
    END IF;
  END LOOP;
END $$;

-- provider_settings contains provider-owned operational settings used by both
-- public availability reads and authenticated provider settings pages.
DO $$
BEGIN
  IF to_regclass('public.provider_settings') IS NOT NULL THEN
    ALTER TABLE public.provider_settings ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Public can read active provider settings" ON public.provider_settings;
    DROP POLICY IF EXISTS "Provider team can view provider settings" ON public.provider_settings;
    DROP POLICY IF EXISTS "Provider team can insert provider settings" ON public.provider_settings;
    DROP POLICY IF EXISTS "Provider team can update provider settings" ON public.provider_settings;
    DROP POLICY IF EXISTS "Provider owners can delete provider settings" ON public.provider_settings;
    DROP POLICY IF EXISTS "Superadmins can manage provider settings" ON public.provider_settings;

    CREATE POLICY "Public can read active provider settings"
      ON public.provider_settings
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.providers p
          WHERE p.id = provider_settings.provider_id
            AND p.status = 'active'
        )
      );

    CREATE POLICY "Provider team can view provider settings"
      ON public.provider_settings
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.providers p
          WHERE p.id = provider_settings.provider_id
            AND p.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.provider_staff ps
          WHERE ps.provider_id = provider_settings.provider_id
            AND ps.user_id = auth.uid()
            AND ps.is_active = true
        )
      );

    CREATE POLICY "Provider team can insert provider settings"
      ON public.provider_settings
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.providers p
          WHERE p.id = provider_settings.provider_id
            AND p.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.provider_staff ps
          WHERE ps.provider_id = provider_settings.provider_id
            AND ps.user_id = auth.uid()
            AND ps.is_active = true
        )
      );

    CREATE POLICY "Provider team can update provider settings"
      ON public.provider_settings
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.providers p
          WHERE p.id = provider_settings.provider_id
            AND p.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.provider_staff ps
          WHERE ps.provider_id = provider_settings.provider_id
            AND ps.user_id = auth.uid()
            AND ps.is_active = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.providers p
          WHERE p.id = provider_settings.provider_id
            AND p.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.provider_staff ps
          WHERE ps.provider_id = provider_settings.provider_id
            AND ps.user_id = auth.uid()
            AND ps.is_active = true
        )
      );

    CREATE POLICY "Provider owners can delete provider settings"
      ON public.provider_settings
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.providers p
          WHERE p.id = provider_settings.provider_id
            AND p.user_id = auth.uid()
        )
      );

    CREATE POLICY "Superadmins can manage provider settings"
      ON public.provider_settings
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.users u
          WHERE u.id = auth.uid()
            AND u.role = 'superadmin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.users u
          WHERE u.id = auth.uid()
            AND u.role = 'superadmin'
        )
      );

    GRANT SELECT ON public.provider_settings TO anon, authenticated, service_role;
    GRANT INSERT, UPDATE, DELETE ON public.provider_settings TO authenticated, service_role;
  END IF;
END $$;
