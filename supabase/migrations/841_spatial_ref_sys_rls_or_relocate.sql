-- 841: Resolve spatial_ref_sys Security Advisor lint (0013_rls_disabled_in_public).
--
-- Strategy A: relocate PostGIS out of public (subtransaction-safe steps).
-- Strategy B: if spatial_ref_sys remains in public, take ownership and enable
-- read-only RLS (satisfies the linter; EPSG reference data only).

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

DO $$
DECLARE
  v_postgis_schema  text;
  v_postgis_version text;
  v_next_version    text;
  v_has_next        boolean;
BEGIN
  IF to_regclass('public.spatial_ref_sys') IS NULL THEN
    RAISE NOTICE 'public.spatial_ref_sys not present; nothing to do.';
    RETURN;
  END IF;

  SELECT n.nspname, e.extversion
  INTO v_postgis_schema, v_postgis_version
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'postgis';

  IF v_postgis_schema IS NULL OR v_postgis_schema <> 'public' THEN
    RAISE NOTICE 'PostGIS already outside public (schema=%).', v_postgis_schema;
    RETURN;
  END IF;

  v_next_version := v_postgis_version || 'next';
  SELECT EXISTS (
    SELECT 1
    FROM pg_available_extension_versions
    WHERE name = 'postgis'
      AND version = v_next_version
  )
  INTO v_has_next;

  BEGIN
    UPDATE pg_extension SET extrelocatable = true WHERE extname = 'postgis';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Could not mark PostGIS relocatable: %', SQLERRM;
  END;

  BEGIN
    ALTER EXTENSION postgis SET SCHEMA extensions;
    RAISE NOTICE 'Relocated PostGIS to extensions schema.';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Could not SET SCHEMA for PostGIS: %', SQLERRM;
  END;

  IF v_has_next THEN
    BEGIN
      EXECUTE format('ALTER EXTENSION postgis UPDATE TO %L', v_next_version);
      ALTER EXTENSION postgis UPDATE;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'PostGIS UPDATE cycle skipped: %', SQLERRM;
    END;
  END IF;

  BEGIN
    UPDATE pg_extension SET extrelocatable = false WHERE extname = 'postgis';
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END $$;

-- Strategy B: enable RLS on any PostGIS system tables still in public.
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
  FOREACH postgis_table IN ARRAY postgis_tables LOOP
    IF to_regclass(format('public.%I', postgis_table)) IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', postgis_table);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not reassign owner for public.%: %', postgis_table, SQLERRM;
    END;

    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', postgis_table);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', postgis_table || '_public_read', postgis_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated, service_role USING (true)',
        postgis_table || '_public_read',
        postgis_table
      );

      RAISE NOTICE 'Enabled read-only RLS on public.%.', postgis_table;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not enable RLS on public.%: %', postgis_table, SQLERRM;
    END;
  END LOOP;
END $$;

-- Keep geospatial RPCs resolving ST_* regardless of which strategy succeeded.
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
        'ALTER FUNCTION %s SET search_path = public, extensions, gis, pg_temp',
        function_signature
      );
    END IF;
  END LOOP;
END $$;
