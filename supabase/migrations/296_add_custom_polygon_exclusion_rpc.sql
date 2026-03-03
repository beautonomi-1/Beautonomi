-- RPC: insert a custom-polygon exclusion and recompute zone geometry.
-- PostgREST/insert may not accept raw GeoJSON for geometry columns; this RPC uses ST_GeomFromGeoJSON.

CREATE OR REPLACE FUNCTION insert_platform_zone_exclusion_custom_polygon(
  p_zone_id UUID,
  p_geojson JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geom geometry;
BEGIN
  v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326);
  IF v_geom IS NULL THEN
    RAISE EXCEPTION 'Invalid GeoJSON for geometry';
  END IF;

  INSERT INTO platform_zone_exclusions (zone_id, type, ref_code, ref_name, geom)
  VALUES (p_zone_id, 'custom_polygon', NULL, NULL, v_geom);

  PERFORM update_platform_zone_geometry(p_zone_id);
END;
$$;

COMMENT ON FUNCTION insert_platform_zone_exclusion_custom_polygon IS 'Insert custom polygon exclusion from GeoJSON and recompute platform zone geometry.';

-- Return number of geometry fragments (1 = single polygon, >1 = disconnected MultiPolygon). For UI warning.
CREATE OR REPLACE FUNCTION st_zone_geometry_fragment_count(p_zone_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ST_NumGeometries(geometry::geometry), 0)::INT
  FROM platform_zones
  WHERE id = p_zone_id AND geometry IS NOT NULL
  LIMIT 1;
$$;
COMMENT ON FUNCTION st_zone_geometry_fragment_count IS 'Number of geometry parts in zone (1 = single polygon, >1 = disconnected fragments).';
