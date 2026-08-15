-- 839: Clear Supabase Security Advisor findings for v_gl_currency_drift,
-- pricing_normalization_audit, terminal_gl_account_map, and spatial_ref_sys.

-- ── SECURITY DEFINER view → security invoker ───────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.v_gl_currency_drift') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.v_gl_currency_drift SET (security_invoker = true)';
  END IF;
END $$;

-- ── pricing_normalization_audit: migration audit trail (service_role writes) ─
DO $$
BEGIN
  IF to_regclass('public.pricing_normalization_audit') IS NOT NULL THEN
    ALTER TABLE public.pricing_normalization_audit ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS pricing_normalization_audit_superadmin_read
      ON public.pricing_normalization_audit;
    DROP POLICY IF EXISTS pricing_normalization_audit_service_role
      ON public.pricing_normalization_audit;

    CREATE POLICY pricing_normalization_audit_superadmin_read
      ON public.pricing_normalization_audit
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.users u
          WHERE u.id = auth.uid()
            AND u.role = 'superadmin'
        )
      );

    CREATE POLICY pricing_normalization_audit_service_role
      ON public.pricing_normalization_audit
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ── terminal_gl_account_map: shadow-journal config (SECURITY DEFINER reads) ─
DO $$
BEGIN
  IF to_regclass('public.terminal_gl_account_map') IS NOT NULL THEN
    ALTER TABLE public.terminal_gl_account_map ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS terminal_gl_account_map_service_role
      ON public.terminal_gl_account_map;

    CREATE POLICY terminal_gl_account_map_service_role
      ON public.terminal_gl_account_map
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ── spatial_ref_sys: PostGIS reference metadata still exposed in public ──────
-- spatial_ref_sys is extension-owned (supabase_admin); enabling RLS fails with
-- "must be owner of table spatial_ref_sys". The fix is to relocate PostGIS out
-- of the API-exposed public schema so the linter no longer scans it.
CREATE SCHEMA IF NOT EXISTS gis;
GRANT USAGE ON SCHEMA gis TO anon, authenticated, service_role;

DO $$
DECLARE
  postgis_schema text;
  target_schema  text;
BEGIN
  SELECT n.nspname
  INTO postgis_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'postgis';

  IF postgis_schema IS NULL OR postgis_schema <> 'public' THEN
    RETURN;
  END IF;

  -- Prefer a dedicated gis schema; fall back to extensions (546).
  FOREACH target_schema IN ARRAY ARRAY['gis', 'extensions'] LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', target_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon, authenticated, service_role', target_schema);

    BEGIN
      EXECUTE format('ALTER EXTENSION postgis SET SCHEMA %I', target_schema);
      RAISE NOTICE 'Relocated PostGIS extension to schema %.', target_schema;
      RETURN;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not relocate PostGIS to %: %', target_schema, SQLERRM;
    END;
  END LOOP;
END $$;

-- Keep SECURITY DEFINER geospatial RPCs working after PostGIS leaves public.
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
      EXECUTE format(
        'ALTER FUNCTION %s SET search_path = public, gis, extensions, pg_temp',
        function_signature
      );
    END IF;
  END LOOP;
END $$;

-- If PostGIS could not be moved, strip direct API access. This does not satisfy
-- the Security Advisor lint (RLS cannot be enabled without table ownership),
-- but it removes anon/authenticated CRUD exposure over PostgREST.
DO $$
DECLARE
  postgis_table text;
  postgis_tables text[] := ARRAY[
    'spatial_ref_sys',
    'geometry_columns',
    'geography_columns',
    'raster_columns',
    'raster_overviews'
  ];
BEGIN
  IF to_regclass('public.spatial_ref_sys') IS NULL THEN
    RETURN;
  END IF;

  FOREACH postgis_table IN ARRAY postgis_tables LOOP
    IF to_regclass(format('public.%I', postgis_table)) IS NOT NULL THEN
      BEGIN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', postgis_table);
        EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', postgis_table);
      EXCEPTION
        WHEN OTHERS THEN
          RAISE NOTICE 'Could not revoke API access on public.%: %', postgis_table, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;
