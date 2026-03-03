-- Service Zones Control Plane: extend platform_zones, add inclusions/exclusions, PostGIS functions

-- Ensure PostGIS is available
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1) Extend platform_zones
ALTER TABLE platform_zones
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  ADD COLUMN IF NOT EXISTS geometry geography(MultiPolygon, 4326),
  ADD COLUMN IF NOT EXISTS centroid geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS bbox JSONB,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- Backfill status for existing rows (allow active/draft)
UPDATE platform_zones SET status = 'active' WHERE status IS NULL;
UPDATE platform_zones SET status = 'active' WHERE is_active = true AND status = 'draft';

-- 2) platform_zone_inclusions
CREATE TABLE IF NOT EXISTS platform_zone_inclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES platform_zones(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('country', 'province', 'city', 'town', 'postal_code')),
  ref_code TEXT NOT NULL,
  ref_name TEXT,
  source TEXT DEFAULT 'postal_dataset',
  geom geometry(Geometry, 4326) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_platform_zone_inclusions_zone_id ON platform_zone_inclusions(zone_id);
CREATE INDEX idx_platform_zone_inclusions_geom ON platform_zone_inclusions USING GIST(geom);

ALTER TABLE platform_zone_inclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage platform_zone_inclusions"
  ON platform_zone_inclusions FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

-- 3) platform_zone_exclusions
CREATE TABLE IF NOT EXISTS platform_zone_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES platform_zones(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('postal_code', 'custom_polygon')),
  ref_code TEXT,
  ref_name TEXT,
  geom geometry(Geometry, 4326) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_platform_zone_exclusions_zone_id ON platform_zone_exclusions(zone_id);
CREATE INDEX idx_platform_zone_exclusions_geom ON platform_zone_exclusions USING GIST(geom);

ALTER TABLE platform_zone_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage platform_zone_exclusions"
  ON platform_zone_exclusions FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

-- 4) Compute zone geometry (returns MultiPolygon in 4326)
CREATE OR REPLACE FUNCTION compute_platform_zone_geometry(p_zone_id UUID)
RETURNS geometry
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_union_incl geometry;
  v_union_excl geometry;
  v_result geometry;
BEGIN
  -- Union all inclusion geometries
  SELECT ST_UnaryUnion(ST_Collect(geom))
  INTO v_union_incl
  FROM platform_zone_inclusions
  WHERE zone_id = p_zone_id AND geom IS NOT NULL;

  IF v_union_incl IS NULL THEN
    RETURN NULL;
  END IF;

  -- Union all exclusion geometries
  SELECT ST_UnaryUnion(ST_Collect(geom))
  INTO v_union_excl
  FROM platform_zone_exclusions
  WHERE zone_id = p_zone_id AND geom IS NOT NULL;

  -- Difference: inclusions minus exclusions
  IF v_union_excl IS NOT NULL THEN
    v_result := ST_Difference(v_union_incl, v_union_excl);
  ELSE
    v_result := v_union_incl;
  END IF;

  -- Ensure valid and multi
  v_result := ST_Multi(ST_Buffer(ST_CollectionExtract(v_result, 3), 0));
  RETURN v_result;
END;
$$;

-- 5) Update platform_zone geometry, centroid, bbox, version
CREATE OR REPLACE FUNCTION update_platform_zone_geometry(p_zone_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geom geometry;
  v_centroid geometry;
  v_bbox jsonb;
  v_area_km2 double precision;
BEGIN
  v_geom := compute_platform_zone_geometry(p_zone_id);

  IF v_geom IS NULL THEN
    UPDATE platform_zones
    SET geometry = NULL, centroid = NULL, bbox = NULL, version = version + 1, updated_at = NOW()
    WHERE id = p_zone_id;
    RETURN;
  END IF;

  v_centroid := ST_Centroid(v_geom);
  v_bbox := jsonb_build_object(
    'minLng', ST_XMin(v_geom),
    'minLat', ST_YMin(v_geom),
    'maxLng', ST_XMax(v_geom),
    'maxLat', ST_YMax(v_geom)
  );

  UPDATE platform_zones
  SET
    geometry = v_geom::geography,
    centroid = v_centroid::geography,
    bbox = v_bbox,
    version = version + 1,
    updated_at = NOW()
  WHERE id = p_zone_id;
END;
$$;

COMMENT ON TABLE platform_zone_inclusions IS 'Included areas for a platform zone (snapshot geometry at selection time)';
COMMENT ON TABLE platform_zone_exclusions IS 'Excluded areas (holes) for a platform zone';
COMMENT ON FUNCTION compute_platform_zone_geometry IS 'Computes MultiPolygon = union(inclusions) - union(exclusions)';
COMMENT ON FUNCTION update_platform_zone_geometry IS 'Updates platform_zones.geometry, centroid, bbox, version';
