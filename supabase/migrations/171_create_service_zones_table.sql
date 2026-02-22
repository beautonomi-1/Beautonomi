-- Migration: Create/Update service_zones table for at-home service area management
-- This allows providers to define custom service zones with different pricing
-- NOTE: Table may already exist from migration 003_providers.sql with different structure
-- This migration adds missing columns if they don't exist

-- Check if table exists and add missing columns
DO $$
BEGIN
  -- Add postal_codes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_zones' AND column_name = 'postal_codes'
  ) THEN
    ALTER TABLE service_zones ADD COLUMN postal_codes TEXT[];
  END IF;

  -- Add cities column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_zones' AND column_name = 'cities'
  ) THEN
    ALTER TABLE service_zones ADD COLUMN cities TEXT[];
  END IF;

  -- Add travel_fee column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_zones' AND column_name = 'travel_fee'
  ) THEN
    ALTER TABLE service_zones ADD COLUMN travel_fee DECIMAL(10, 2) NOT NULL DEFAULT 0;
  END IF;

  -- Add currency column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_zones' AND column_name = 'currency'
  ) THEN
    ALTER TABLE service_zones ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'ZAR';
  END IF;

  -- Add travel_time_minutes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_zones' AND column_name = 'travel_time_minutes'
  ) THEN
    ALTER TABLE service_zones ADD COLUMN travel_time_minutes INTEGER DEFAULT 30;
  END IF;

  -- Add description column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_zones' AND column_name = 'description'
  ) THEN
    ALTER TABLE service_zones ADD COLUMN description TEXT;
  END IF;

  -- Update zone_type constraint to include postal_code and city if needed
  -- (This is handled by the CHECK constraint below)
END $$;

-- Create table if it doesn't exist (for fresh installs)
CREATE TABLE IF NOT EXISTS service_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
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
  
  -- Pricing
  travel_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  
  -- Estimated travel time in minutes
  travel_time_minutes INTEGER DEFAULT 30,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints (only add if table is being created)
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

-- Update zone_type constraint to allow postal_code and city (if constraint exists)
DO $$
BEGIN
  -- Drop old constraint if it exists and only allows radius/polygon
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'service_zones' 
    AND constraint_name LIKE '%zone_type%'
  ) THEN
    -- Check if we need to update the constraint
    -- We'll recreate it below if needed
    NULL;
  END IF;
END $$;

-- Add/update zone_type constraint to include all types
DO $$
BEGIN
  -- Drop existing constraint if it's too restrictive
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name LIKE '%zone_type%'
  ) THEN
    ALTER TABLE service_zones DROP CONSTRAINT IF EXISTS service_zones_zone_type_check;
  END IF;
  
  -- Add new constraint that allows all zone types
  ALTER TABLE service_zones 
  ADD CONSTRAINT service_zones_zone_type_check 
  CHECK (zone_type IN ('postal_code', 'city', 'polygon', 'radius'));
EXCEPTION
  WHEN duplicate_object THEN
    -- Constraint already exists with correct values, skip
    NULL;
END $$;

-- Indexes for performance
CREATE INDEX idx_service_zones_provider_id ON service_zones(provider_id);
CREATE INDEX idx_service_zones_provider_active ON service_zones(provider_id, is_active) WHERE is_active = true;
CREATE INDEX idx_service_zones_postal_codes ON service_zones USING GIN(postal_codes) WHERE zone_type = 'postal_code';
CREATE INDEX idx_service_zones_cities ON service_zones USING GIN(cities) WHERE zone_type = 'city';

-- Enable RLS
ALTER TABLE service_zones ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Providers can view their own service zones
CREATE POLICY "Providers can view their own service zones"
  ON service_zones
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = service_zones.provider_id
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

-- Providers can insert their own service zones
CREATE POLICY "Providers can insert their own service zones"
  ON service_zones
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = service_zones.provider_id
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

-- Providers can update their own service zones
CREATE POLICY "Providers can update their own service zones"
  ON service_zones
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = service_zones.provider_id
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

-- Providers can delete their own service zones
CREATE POLICY "Providers can delete their own service zones"
  ON service_zones
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = service_zones.provider_id
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

-- Public can view active service zones (for booking flow)
CREATE POLICY "Public can view active service zones"
  ON service_zones
  FOR SELECT
  USING (is_active = true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_service_zones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER update_service_zones_updated_at
  BEFORE UPDATE ON service_zones
  FOR EACH ROW
  EXECUTE FUNCTION update_service_zones_updated_at();

-- Add comment
COMMENT ON TABLE service_zones IS 'Service zones for at-home bookings. Supports postal code, city, polygon, and radius-based zones.';
COMMENT ON COLUMN service_zones.zone_type IS 'Type of zone: postal_code, city, polygon, or radius';
COMMENT ON COLUMN service_zones.polygon_coordinates IS 'GeoJSON polygon coordinates for polygon zones: [[[lng, lat], [lng, lat], ...]]';
