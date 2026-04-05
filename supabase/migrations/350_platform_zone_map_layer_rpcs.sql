-- Admin map preview: union of inclusion / exclusion geometries as simplified GeoJSON (read-only helpers).
-- Does not change compute_platform_zone_geometry or platform_zones.geometry.

CREATE OR REPLACE FUNCTION st_asgeojson_zone_inclusions_union_simplified(
  p_zone_id UUID,
  p_tolerance DOUBLE PRECISION DEFAULT 0.0001
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geom geometry;
BEGIN
  SELECT ST_UnaryUnion(ST_Collect(geom::geometry))
  INTO v_geom
  FROM platform_zone_inclusions
  WHERE zone_id = p_zone_id AND geom IS NOT NULL;

  IF v_geom IS NULL THEN
    RETURN NULL;
  END IF;

  v_geom := ST_SimplifyPreserveTopology(v_geom, p_tolerance);
  v_geom := ST_Multi(ST_Buffer(v_geom, 0));

  RETURN ST_AsGeoJSON(v_geom)::jsonb;
END;
$$;

COMMENT ON FUNCTION st_asgeojson_zone_inclusions_union_simplified IS
  'Simplified ST_Union(inclusion geoms) as GeoJSON geometry for admin map (gross coverage before holes).';

CREATE OR REPLACE FUNCTION st_asgeojson_zone_exclusions_union_simplified(
  p_zone_id UUID,
  p_tolerance DOUBLE PRECISION DEFAULT 0.0001
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geom geometry;
BEGIN
  SELECT ST_UnaryUnion(ST_Collect(geom::geometry))
  INTO v_geom
  FROM platform_zone_exclusions
  WHERE zone_id = p_zone_id AND geom IS NOT NULL;

  IF v_geom IS NULL THEN
    RETURN NULL;
  END IF;

  v_geom := ST_SimplifyPreserveTopology(v_geom, p_tolerance);
  v_geom := ST_Multi(ST_Buffer(v_geom, 0));

  RETURN ST_AsGeoJSON(v_geom)::jsonb;
END;
$$;

COMMENT ON FUNCTION st_asgeojson_zone_exclusions_union_simplified IS
  'Simplified ST_Union(exclusion geoms) as GeoJSON geometry for admin map overlay.';
