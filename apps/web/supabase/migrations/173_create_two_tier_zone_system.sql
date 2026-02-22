-- Migration: Create two-tier zone system
-- Platform zones (superadmin managed) and provider zone selections

-- ============================================================================
-- PLATFORM ZONES TABLE
-- ============================================================================
-- Superadmin creates platform zones to define where the platform is available
CREATE TABLE IF NOT EXISTS platform_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  zone_type VARCHAR(50) NOT NULL CHECK (zone_type IN ('postal_code', 'city', 'polygon', 'radius')),
  
  -- For postal_code type: store array of postal codes
  postal_codes TEXT[],
  
  -- For city type: store array of city names
  cities TEXT[],
  
  -- For polygon type: store GeoJSON polygon coordinates
  -- Format: [[[lng, lat], [lng, lat], ...]] (array of coordinate pairs)
  polygon_coordinates JSONB,
  
  -- For radius type: store center point and radius
  center_latitude DECIMAL(10, 8),
  center_longitude DECIMAL(11, 8),
  radius_km DECIMAL(10, 2),
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id), -- Superadmin who created it
  
  -- Constraints
  CONSTRAINT valid_postal_code_zone CHECK (
    zone_type != 'postal_code' OR (postal_codes IS NOT NULL AND array_length(postal_codes, 1) > 0)
  ),
  CONSTRAINT valid_city_zone CHECK (
    zone_type != 'city' OR (cities IS NOT NULL AND array_length(cities, 1) > 0)
  ),
  CONSTRAINT valid_polygon_zone CHECK (
    zone_type != 'polygon' OR polygon_coordinates IS NOT NULL
  ),
  CONSTRAINT valid_radius_zone CHECK (
    zone_type != 'radius' OR (
      center_latitude IS NOT NULL AND 
      center_longitude IS NOT NULL AND 
      radius_km IS NOT NULL
    )
  )
);

-- Indexes for platform zones
CREATE INDEX idx_platform_zones_active ON platform_zones(is_active) WHERE is_active = true;
CREATE INDEX idx_platform_zones_postal_codes ON platform_zones USING GIN(postal_codes) WHERE zone_type = 'postal_code';
CREATE INDEX idx_platform_zones_cities ON platform_zones USING GIN(cities) WHERE zone_type = 'city';

-- ============================================================================
-- PROVIDER ZONE SELECTIONS TABLE
-- ============================================================================
-- Providers opt into platform zones and set their own pricing
CREATE TABLE IF NOT EXISTS provider_zone_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  platform_zone_id UUID NOT NULL REFERENCES platform_zones(id) ON DELETE CASCADE,
  
  -- Provider-specific pricing for this zone
  travel_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  travel_time_minutes INTEGER DEFAULT 30,
  
  -- Optional description/notes
  description TEXT,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure provider can only select a zone once
  UNIQUE(provider_id, platform_zone_id)
);

-- Indexes for provider zone selections
CREATE INDEX idx_provider_zone_selections_provider_id ON provider_zone_selections(provider_id);
CREATE INDEX idx_provider_zone_selections_platform_zone_id ON provider_zone_selections(platform_zone_id);
CREATE INDEX idx_provider_zone_selections_provider_active ON provider_zone_selections(provider_id, is_active) WHERE is_active = true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Platform Zones RLS
ALTER TABLE platform_zones ENABLE ROW LEVEL SECURITY;

-- Superadmin can do everything with platform zones
CREATE POLICY "Superadmins can manage platform zones"
  ON platform_zones
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Public can view active platform zones (for booking validation)
CREATE POLICY "Public can view active platform zones"
  ON platform_zones
  FOR SELECT
  USING (is_active = true);

-- Provider Zone Selections RLS
ALTER TABLE provider_zone_selections ENABLE ROW LEVEL SECURITY;

-- Providers can view their own zone selections
CREATE POLICY "Providers can view their own zone selections"
  ON provider_zone_selections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = provider_zone_selections.provider_id
      AND (
        providers.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff
          WHERE provider_staff.provider_id = providers.id
          AND provider_staff.user_id = auth.uid()
          AND provider_staff.role IN ('owner', 'admin', 'manager')
        )
      )
    )
  );

-- Providers can insert their own zone selections
CREATE POLICY "Providers can insert their own zone selections"
  ON provider_zone_selections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = provider_zone_selections.provider_id
      AND (
        providers.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff
          WHERE provider_staff.provider_id = providers.id
          AND provider_staff.user_id = auth.uid()
          AND provider_staff.role IN ('owner', 'admin', 'manager')
        )
      )
    )
  );

-- Providers can update their own zone selections
CREATE POLICY "Providers can update their own zone selections"
  ON provider_zone_selections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = provider_zone_selections.provider_id
      AND (
        providers.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff
          WHERE provider_staff.provider_id = providers.id
          AND provider_staff.user_id = auth.uid()
          AND provider_staff.role IN ('owner', 'admin', 'manager')
        )
      )
    )
  );

-- Providers can delete their own zone selections
CREATE POLICY "Providers can delete their own zone selections"
  ON provider_zone_selections
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = provider_zone_selections.provider_id
      AND (
        providers.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff
          WHERE provider_staff.provider_id = providers.id
          AND provider_staff.user_id = auth.uid()
          AND provider_staff.role IN ('owner', 'admin', 'manager')
        )
      )
    )
  );

-- Superadmin can view all provider zone selections
CREATE POLICY "Superadmins can view all provider zone selections"
  ON provider_zone_selections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp for platform_zones
CREATE OR REPLACE FUNCTION update_platform_zones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for platform_zones
CREATE TRIGGER update_platform_zones_updated_at
  BEFORE UPDATE ON platform_zones
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_zones_updated_at();

-- Function to update updated_at timestamp for provider_zone_selections
CREATE OR REPLACE FUNCTION update_provider_zone_selections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for provider_zone_selections
CREATE TRIGGER update_provider_zone_selections_updated_at
  BEFORE UPDATE ON provider_zone_selections
  FOR EACH ROW
  EXECUTE FUNCTION update_provider_zone_selections_updated_at();

-- Function to get available platform zones for a provider
CREATE OR REPLACE FUNCTION get_available_platform_zones_for_provider(p_provider_id UUID)
RETURNS TABLE (
  zone_id UUID,
  zone_name VARCHAR(255),
  zone_type VARCHAR(50),
  is_selected BOOLEAN,
  provider_travel_fee DECIMAL(10, 2),
  provider_currency VARCHAR(3),
  provider_travel_time_minutes INTEGER,
  provider_is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pz.id AS zone_id,
    pz.name AS zone_name,
    pz.zone_type,
    COALESCE(pzs.id IS NOT NULL, false) AS is_selected,
    COALESCE(pzs.travel_fee, 0) AS provider_travel_fee,
    COALESCE(pzs.currency, 'ZAR') AS provider_currency,
    COALESCE(pzs.travel_time_minutes, 30) AS provider_travel_time_minutes,
    COALESCE(pzs.is_active, false) AS provider_is_active
  FROM platform_zones pz
  LEFT JOIN provider_zone_selections pzs ON pzs.platform_zone_id = pz.id AND pzs.provider_id = p_provider_id
  WHERE pz.is_active = true
  ORDER BY pz.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE platform_zones IS 'Platform-wide service zones defined by superadmin. Defines where the platform is available.';
COMMENT ON TABLE provider_zone_selections IS 'Provider selections of platform zones with custom pricing. Providers opt into platform zones and set their own travel fees.';
COMMENT ON COLUMN platform_zones.created_by IS 'Superadmin user who created this platform zone';
COMMENT ON COLUMN provider_zone_selections.travel_fee IS 'Provider-specific travel fee for this zone';
COMMENT ON COLUMN provider_zone_selections.is_active IS 'Whether this provider selection is active (provider can temporarily disable without deleting)';
