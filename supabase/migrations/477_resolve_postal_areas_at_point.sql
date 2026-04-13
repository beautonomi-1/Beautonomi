-- Resolve postal area rows that cover a geographic point (admin SPA coordinate lookup).

CREATE OR REPLACE FUNCTION resolve_postal_areas_at_point(
  p_country_code TEXT,
  p_lng DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_max_rows INT DEFAULT 200
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(x.obj ORDER BY x.postal_code)
      FROM (
        SELECT DISTINCT ON (trim(pa.postal_code))
          trim(pa.postal_code) AS postal_code,
          jsonb_build_object(
            'postal_code', trim(pa.postal_code),
            'province_name', pa.province_name,
            'city_name', pa.city_name,
            'town_name', pa.town_name
          ) AS obj
        FROM postal_areas pa
        WHERE pa.country_code = upper(trim(p_country_code))
          AND pa.geom IS NOT NULL
          AND pa.postal_code IS NOT NULL
          AND trim(pa.postal_code) <> ''
          AND ST_Covers(pa.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
        ORDER BY trim(pa.postal_code), pa.id
        LIMIT GREATEST(1, LEAST(COALESCE(p_max_rows, 200), 500))
      ) x
    ),
    '[]'::jsonb
  );
$$;

COMMENT ON FUNCTION resolve_postal_areas_at_point IS
  'Return postal_areas rows whose geometry covers the given WGS84 point (for admin zone tooling).';
