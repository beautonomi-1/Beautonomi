-- RPC for service zone areas: return union of postal_areas geometry as GeoJSON (simplified).
-- Used by GET /api/admin/service-zones/areas/geometry for map preview.

CREATE OR REPLACE FUNCTION get_postal_areas_geometry_geojson(
  p_country_code TEXT,
  p_postal_codes TEXT[] DEFAULT NULL,
  p_province TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_town TEXT DEFAULT NULL,
  p_tolerance DOUBLE PRECISION DEFAULT 0.0001
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geom geometry;
  v_geojson jsonb;
BEGIN
  SELECT ST_UnaryUnion(ST_Collect(geom))
  INTO v_geom
  FROM postal_areas
  WHERE country_code = p_country_code
    AND geom IS NOT NULL
    AND (p_postal_codes IS NULL OR postal_code = ANY(p_postal_codes))
    AND (p_province IS NULL OR province_name = p_province)
    AND (p_city IS NULL OR city_name = p_city)
    AND (p_town IS NULL OR town_name = p_town);

  IF v_geom IS NULL THEN
    RETURN jsonb_build_object('type', 'FeatureCollection', 'features', '[]'::jsonb);
  END IF;

  v_geom := ST_SimplifyPreserveTopology(v_geom, p_tolerance);
  v_geom := ST_Multi(ST_Buffer(v_geom, 0));

  v_geojson := ST_AsGeoJSON(v_geom)::jsonb;
  RETURN jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_build_array(
      jsonb_build_object('type', 'Feature', 'geometry', v_geojson, 'properties', '{}'::jsonb)
    )
  );
END;
$$;

COMMENT ON FUNCTION get_postal_areas_geometry_geojson IS 'Returns simplified union of postal_areas as GeoJSON FeatureCollection for admin map preview';

-- RPC: return simplified zone geometry as GeoJSON for admin map display
CREATE OR REPLACE FUNCTION st_asgeojson_zone_simplified(p_zone_id UUID, p_tolerance DOUBLE PRECISION DEFAULT 0.0001)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geom geometry;
BEGIN
  SELECT ST_SimplifyPreserveTopology(geometry::geometry, p_tolerance)
  INTO v_geom
  FROM platform_zones
  WHERE id = p_zone_id AND geometry IS NOT NULL;
  IF v_geom IS NULL THEN RETURN NULL; END IF;
  RETURN ST_AsGeoJSON(v_geom)::jsonb;
END;
$$;
COMMENT ON FUNCTION st_asgeojson_zone_simplified IS 'Simplified zone geometry as GeoJSON for admin preview';
