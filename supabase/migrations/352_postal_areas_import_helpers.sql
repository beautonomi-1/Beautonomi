-- Postal areas import helpers (production-scale dataset flow)
-- Supports staged CSV/GeoNames imports and deterministic rebuild into postal_areas.

CREATE TABLE IF NOT EXISTS postal_areas_import_stage (
  id BIGSERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  province_name TEXT,
  city_name TEXT,
  town_name TEXT,
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  source TEXT DEFAULT 'manual_import',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_postal_areas_import_stage_country
  ON postal_areas_import_stage (country_code);

CREATE INDEX IF NOT EXISTS idx_postal_areas_import_stage_country_postal
  ON postal_areas_import_stage (country_code, postal_code);

CREATE OR REPLACE FUNCTION normalize_postal_area_label(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(trim(COALESCE(p_text, '')), '\s+', ' ', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION rebuild_postal_areas_from_stage(
  p_country_code TEXT DEFAULT 'ZA',
  p_point_radius_m INTEGER DEFAULT 800
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cc TEXT := upper(trim(COALESCE(p_country_code, '')));
  v_stage_rows INTEGER := 0;
  v_inserted_rows INTEGER := 0;
BEGIN
  IF v_cc = '' THEN
    RAISE EXCEPTION 'country code is required';
  END IF;

  IF p_point_radius_m < 50 OR p_point_radius_m > 5000 THEN
    RAISE EXCEPTION 'p_point_radius_m out of allowed range (50..5000): %', p_point_radius_m;
  END IF;

  SELECT COUNT(*)
  INTO v_stage_rows
  FROM postal_areas_import_stage s
  WHERE upper(s.country_code) = v_cc
    AND s.latitude IS NOT NULL
    AND s.longitude IS NOT NULL
    AND s.latitude BETWEEN -90 AND 90
    AND s.longitude BETWEEN -180 AND 180;

  IF v_stage_rows = 0 THEN
    RETURN jsonb_build_object(
      'country_code', v_cc,
      'stage_rows', 0,
      'inserted_rows', 0,
      'message', 'No valid stage rows found for country'
    );
  END IF;

  DELETE FROM postal_areas WHERE upper(country_code) = v_cc;

  WITH cleaned AS (
    SELECT
      upper(trim(s.country_code)) AS country_code,
      normalize_postal_area_label(s.province_name) AS province_name,
      normalize_postal_area_label(s.city_name) AS city_name,
      normalize_postal_area_label(s.town_name) AS town_name,
      normalize_postal_area_label(s.postal_code) AS postal_code,
      s.latitude,
      s.longitude,
      ROW_NUMBER() OVER (
        PARTITION BY
          upper(trim(s.country_code)),
          COALESCE(normalize_postal_area_label(s.postal_code), '__NULL__'),
          COALESCE(normalize_postal_area_label(s.province_name), '__NULL__'),
          COALESCE(normalize_postal_area_label(s.city_name), '__NULL__'),
          COALESCE(normalize_postal_area_label(s.town_name), '__NULL__')
        ORDER BY s.id
      ) AS rn
    FROM postal_areas_import_stage s
    WHERE upper(s.country_code) = v_cc
      AND s.latitude IS NOT NULL
      AND s.longitude IS NOT NULL
      AND s.latitude BETWEEN -90 AND 90
      AND s.longitude BETWEEN -180 AND 180
  ),
  inserted AS (
    INSERT INTO postal_areas (
      country_code,
      province_name,
      city_name,
      town_name,
      postal_code,
      geom
    )
    SELECT
      c.country_code,
      c.province_name,
      c.city_name,
      c.town_name,
      c.postal_code,
      ST_Buffer(
        ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)::geography,
        p_point_radius_m
      )::geometry
    FROM cleaned c
    WHERE c.rn = 1
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted_rows FROM inserted;

  RETURN jsonb_build_object(
    'country_code', v_cc,
    'stage_rows', v_stage_rows,
    'inserted_rows', v_inserted_rows,
    'point_radius_m', p_point_radius_m
  );
END;
$$;

COMMENT ON TABLE postal_areas_import_stage IS
  'Staging table for bulk postal area imports (CSV/GeoNames/etc.) before rebuild into postal_areas.';

COMMENT ON FUNCTION rebuild_postal_areas_from_stage IS
  'Rebuilds postal_areas for a country from staged rows, creating buffered point geometries.';
