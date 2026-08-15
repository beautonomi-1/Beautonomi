-- 840: Relocate PostGIS out of public so spatial_ref_sys is no longer scanned
-- by the Security Advisor (0013_rls_disabled_in_public).
--
-- PostGIS 2.3+ is not relocatable by default and spatial_ref_sys is owned by
-- supabase_admin, so RLS cannot be enabled. Supabase documents toggling
-- extrelocatable temporarily:
-- https://supabase.com/docs/guides/database/extensions/postgis#troubleshooting

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

DO $$
DECLARE
  v_postgis_schema text;
  v_postgis_version text;
  v_next_version text;
  v_has_next boolean;
BEGIN
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

  UPDATE pg_extension
  SET extrelocatable = true
  WHERE extname = 'postgis';

  ALTER EXTENSION postgis SET SCHEMA extensions;

  IF v_has_next THEN
    EXECUTE format('ALTER EXTENSION postgis UPDATE TO %L', v_next_version);
    ALTER EXTENSION postgis UPDATE;
  END IF;

  UPDATE pg_extension
  SET extrelocatable = false
  WHERE extname = 'postgis';

  RAISE NOTICE 'Relocated PostGIS % from public to extensions.', v_postgis_version;
EXCEPTION
  WHEN OTHERS THEN
    BEGIN
      UPDATE pg_extension
      SET extrelocatable = false
      WHERE extname = 'postgis';
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    RAISE NOTICE
      'Could not relocate PostGIS out of public: %. '
      'spatial_ref_sys will remain a Security Advisor false positive; '
      'contact Supabase support or ignore (EPSG reference data only).',
      SQLERRM;
END $$;

-- Keep application geospatial RPCs resolving ST_* after the schema move.
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
