-- 843: Residual Security Advisor warnings after 842.
--
-- 1. PostGIS st_* helpers in public: strip anon/authenticated execute.
-- 2. check_point_in_platform_zones: keep SECURITY DEFINER so anon/authenticated
--    callers do not need direct PostGIS EXECUTE (booking zone + travel-fee paths).
-- 3. Portal token RPCs: service_role only (Next.js portal routes use admin client).

-- ── PostGIS functions still living in public ─────────────────────────────────
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS ident
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
          AND e.extname = 'postgis'
      )
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.ident);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.ident);
    EXCEPTION
      WHEN insufficient_privilege OR undefined_function THEN
        RAISE NOTICE 'Could not harden PostGIS function %: %', fn.ident, SQLERRM;
    END;
  END LOOP;
END $$;

-- ── Zone check: DEFINER wrapper (PostGIS EXECUTE revoked for anon above) ───────
CREATE OR REPLACE FUNCTION public.check_point_in_platform_zones(
  p_lng double precision,
  p_lat double precision
)
RETURNS TABLE (zone_id uuid, zone_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, gis, pg_temp
AS $$
  SELECT pz.id AS zone_id, pz.name AS zone_name
  FROM public.platform_zones pz
  WHERE pz.status = 'active'
    AND pz.geometry IS NOT NULL
    AND ST_Contains(
      pz.geometry::geometry,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
    );
$$;

REVOKE ALL ON FUNCTION public.check_point_in_platform_zones(double precision, double precision)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_point_in_platform_zones(double precision, double precision)
  TO anon, authenticated, service_role;

-- ── Portal token RPCs: service_role only ─────────────────────────────────────
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS ident
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('validate_portal_token', 'use_portal_token')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.ident);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.ident);
  END LOOP;
END $$;
