-- RPC: insert postal-code inclusions by drawn polygon and recompute zone geometry.
-- This lets superadmins draw an "included area" on the map and automatically
-- pull all intersecting postal_areas rows.

CREATE OR REPLACE FUNCTION insert_platform_zone_inclusions_from_custom_polygon(
  p_zone_id UUID,
  p_geojson JSONB,
  p_max_rows INT DEFAULT 12000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geom geometry;
  v_country TEXT;
  v_matched INT := 0;
  v_included INT := 0;
  v_truncated BOOLEAN := FALSE;
BEGIN
  IF p_max_rows IS NULL OR p_max_rows < 1 THEN
    p_max_rows := 12000;
  END IF;

  SELECT country_code
  INTO v_country
  FROM platform_zones
  WHERE id = p_zone_id;

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'Zone not found or country_code missing for zone %', p_zone_id;
  END IF;

  v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326);
  IF v_geom IS NULL THEN
    RAISE EXCEPTION 'Invalid GeoJSON for geometry';
  END IF;

  -- Count with +1 sentinel so we can signal truncation without full table scans.
  SELECT COUNT(*)
  INTO v_matched
  FROM (
    SELECT 1
    FROM postal_areas pa
    WHERE pa.country_code = upper(v_country)
      AND pa.geom IS NOT NULL
      AND pa.postal_code IS NOT NULL
      AND ST_Intersects(pa.geom, v_geom)
    LIMIT p_max_rows + 1
  ) t;

  v_truncated := v_matched > p_max_rows;

  WITH candidates AS (
    SELECT DISTINCT
      trim(pa.postal_code) AS postal_code,
      pa.province_name,
      pa.city_name,
      pa.town_name,
      pa.geom
    FROM postal_areas pa
    WHERE pa.country_code = upper(v_country)
      AND pa.geom IS NOT NULL
      AND pa.postal_code IS NOT NULL
      AND ST_Intersects(pa.geom, v_geom)
    LIMIT p_max_rows
  ),
  inserted AS (
    INSERT INTO platform_zone_inclusions
      (zone_id, type, ref_code, ref_name, source, geom)
    SELECT
      p_zone_id,
      'postal_code',
      c.postal_code,
      concat_ws(
        ' · ',
        c.postal_code,
        nullif(concat_ws(', ', c.town_name, c.city_name, c.province_name), '')
      ),
      'drawn_polygon',
      c.geom
    FROM candidates c
    WHERE c.postal_code IS NOT NULL
      AND c.postal_code <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM platform_zone_inclusions i
        WHERE i.zone_id = p_zone_id
          AND i.ref_code = c.postal_code
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_included FROM inserted;

  PERFORM update_platform_zone_geometry(p_zone_id);

  RETURN jsonb_build_object(
    'included', v_included,
    'matched_areas', LEAST(v_matched, p_max_rows),
    'truncated', v_truncated
  );
END;
$$;

COMMENT ON FUNCTION insert_platform_zone_inclusions_from_custom_polygon IS
  'Insert postal-code inclusions by intersecting postal_areas with drawn polygon and recompute zone geometry. Returns {included, matched_areas, truncated}.';
