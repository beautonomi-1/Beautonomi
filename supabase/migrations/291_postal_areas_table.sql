-- Service Zones Control Plane: postal_areas dataset table
-- Stores polygon boundaries for postal codes and admin regions (country/province/city/town).
-- PostGIS required (created in 001_initial_schema).
-- Load data via seed script or import; see docs/SERVICE_ZONES_CONTROL_PLANE.md

CREATE TABLE IF NOT EXISTS postal_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  province_name TEXT,
  city_name TEXT,
  town_name TEXT,
  postal_code TEXT,
  geom geometry(Geometry, 4326) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_postal_areas_country_province ON postal_areas(country_code, province_name);
CREATE INDEX idx_postal_areas_country_city ON postal_areas(country_code, city_name);
CREATE INDEX idx_postal_areas_country_town ON postal_areas(country_code, town_name);
CREATE INDEX idx_postal_areas_country_postal ON postal_areas(country_code, postal_code);
CREATE INDEX idx_postal_areas_geom ON postal_areas USING GIST(geom);

ALTER TABLE postal_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage postal_areas"
  ON postal_areas FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

COMMENT ON TABLE postal_areas IS 'Boundary dataset for service zone control plane. Load via seed/import.';
