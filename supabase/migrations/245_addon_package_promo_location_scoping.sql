-- Beautonomi Database Migration
-- 245_addon_package_promo_location_scoping.sql
-- Branch scoping for add-ons, packages, and promotions (discount codes).
-- Same pattern as offering_locations: no rows = available at all locations; with rows = only those locations.
-- Promotions: nullable location_id = valid at any branch; set = valid only at that branch.

-- =============================================================================
-- 1. Addon locations (which add-ons are available at which branch)
-- =============================================================================
-- Addons are offerings with service_type = 'addon' (service_addons is a view). FK must reference the table.
CREATE TABLE IF NOT EXISTS addon_locations (
  addon_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES provider_locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (addon_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_addon_locations_addon ON addon_locations(addon_id);
CREATE INDEX IF NOT EXISTS idx_addon_locations_location ON addon_locations(location_id);

COMMENT ON TABLE addon_locations IS 'Which add-ons are available at which locations. Empty set for an addon = available at all locations.';

-- =============================================================================
-- 2. Package locations (which packages are available at which branch)
-- =============================================================================
CREATE TABLE IF NOT EXISTS package_locations (
  package_id UUID NOT NULL REFERENCES service_packages(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES provider_locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (package_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_package_locations_package ON package_locations(package_id);
CREATE INDEX IF NOT EXISTS idx_package_locations_location ON package_locations(location_id);

COMMENT ON TABLE package_locations IS 'Which packages are available at which locations. Empty set for a package = available at all locations.';

-- =============================================================================
-- 3. Promotions: optional branch restriction
-- =============================================================================
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES provider_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_promotions_location ON promotions(location_id) WHERE location_id IS NOT NULL;

COMMENT ON COLUMN promotions.location_id IS 'When set, this promotion is valid only for bookings at this location (at_salon). NULL = valid at any location.';

-- =============================================================================
-- RLS for new tables (follow provider pattern)
-- =============================================================================
ALTER TABLE addon_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_locations ENABLE ROW LEVEL SECURITY;

-- addon_locations: providers can manage for their addons
CREATE POLICY "Providers can manage addon_locations for own addons"
  ON addon_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM service_addons sa
      JOIN providers p ON p.id = sa.provider_id
      WHERE sa.id = addon_locations.addon_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM provider_staff ps WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
      ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_addons sa
      JOIN providers p ON p.id = sa.provider_id
      WHERE sa.id = addon_locations.addon_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM provider_staff ps WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
      ))
    )
  );

-- package_locations: providers can manage for their packages
CREATE POLICY "Providers can manage package_locations for own packages"
  ON package_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM service_packages sp
      JOIN providers p ON p.id = sp.provider_id
      WHERE sp.id = package_locations.package_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM provider_staff ps WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
      ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_packages sp
      JOIN providers p ON p.id = sp.provider_id
      WHERE sp.id = package_locations.package_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM provider_staff ps WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
      ))
    )
  );

-- Public can read addon_locations / package_locations for active providers (for booking validation)
CREATE POLICY "Public can read addon_locations for active addons"
  ON addon_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM service_addons sa
      JOIN providers p ON p.id = sa.provider_id
      WHERE sa.id = addon_locations.addon_id AND sa.is_active = true AND p.status = 'active'
    )
  );

CREATE POLICY "Public can read package_locations for active packages"
  ON package_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM service_packages sp
      JOIN providers p ON p.id = sp.provider_id
      WHERE sp.id = package_locations.package_id AND sp.is_active = true AND p.status = 'active'
    )
  );
