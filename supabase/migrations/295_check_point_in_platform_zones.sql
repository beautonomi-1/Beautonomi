-- RPC: check if a point (lng, lat) falls inside any active platform zone geometry.
-- Used by POST /api/mapbox/check-zone to return platform coverage (e.g. "Services available in your area").

CREATE OR REPLACE FUNCTION check_point_in_platform_zones(
  p_lng DOUBLE PRECISION,
  p_lat DOUBLE PRECISION
)
RETURNS TABLE (zone_id UUID, zone_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pz.id AS zone_id, pz.name AS zone_name
  FROM platform_zones pz
  WHERE pz.status = 'active'
    AND pz.geometry IS NOT NULL
    AND ST_Contains(
      pz.geometry,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    );
$$;

COMMENT ON FUNCTION check_point_in_platform_zones IS 'Returns active platform zones that contain the given WGS84 point (lng, lat).';
