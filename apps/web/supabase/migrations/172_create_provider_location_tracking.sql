-- Migration: Create provider location tracking table for real-time GPS tracking
-- This table stores periodic location updates from providers during at-home service journeys

CREATE TABLE IF NOT EXISTS provider_location_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL,
  
  -- Location coordinates
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(10, 2), -- GPS accuracy in meters
  altitude DECIMAL(10, 2), -- Altitude in meters (optional)
  heading DECIMAL(5, 2), -- Direction of travel in degrees (0-360)
  speed DECIMAL(5, 2), -- Speed in m/s (optional)
  
  -- Tracking metadata
  update_type VARCHAR(50) DEFAULT 'periodic', -- 'periodic', 'manual', 'arrival', 'departure'
  is_estimated BOOLEAN DEFAULT false, -- True if location is estimated (fallback mode)
  estimated_reason TEXT, -- Reason for estimation (e.g., 'gps_unavailable', 'low_accuracy')
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT valid_coordinates CHECK (
    latitude >= -90 AND latitude <= 90 AND
    longitude >= -180 AND longitude <= 180
  )
);

-- Indexes for performance
CREATE INDEX idx_provider_location_booking_id ON provider_location_updates(booking_id);
CREATE INDEX idx_provider_location_provider_id ON provider_location_updates(provider_id);
CREATE INDEX idx_provider_location_created_at ON provider_location_updates(created_at DESC);
CREATE INDEX idx_provider_location_booking_created ON provider_location_updates(booking_id, created_at DESC);

-- Enable RLS
ALTER TABLE provider_location_updates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Providers can view their own location updates
CREATE POLICY "Providers can view their own location updates"
  ON provider_location_updates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = provider_location_updates.provider_id
      AND (
        providers.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff
          WHERE provider_staff.provider_id = providers.id
          AND provider_staff.user_id = auth.uid()
        )
      )
    )
  );

-- Providers can insert their own location updates
CREATE POLICY "Providers can insert their own location updates"
  ON provider_location_updates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = provider_location_updates.provider_id
      AND (
        providers.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff
          WHERE provider_staff.provider_id = providers.id
          AND provider_staff.user_id = auth.uid()
        )
      )
    )
  );

-- Customers can view location updates for their bookings (for real-time tracking)
CREATE POLICY "Customers can view location updates for their bookings"
  ON provider_location_updates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = provider_location_updates.booking_id
      AND bookings.customer_id = auth.uid()
      AND bookings.location_type = 'at_home'
      AND bookings.status IN ('confirmed', 'in_progress')
    )
  );

-- Function to get latest location for a booking
CREATE OR REPLACE FUNCTION get_latest_provider_location(booking_uuid UUID)
RETURNS TABLE (
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  accuracy DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE,
  is_estimated BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    plu.latitude,
    plu.longitude,
    plu.accuracy,
    plu.created_at,
    plu.is_estimated
  FROM provider_location_updates plu
  WHERE plu.booking_id = booking_uuid
  ORDER BY plu.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get location history for a booking
CREATE OR REPLACE FUNCTION get_provider_location_history(booking_uuid UUID, limit_count INTEGER DEFAULT 100)
RETURNS TABLE (
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  accuracy DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE,
  is_estimated BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    plu.latitude,
    plu.longitude,
    plu.accuracy,
    plu.created_at,
    plu.is_estimated
  FROM provider_location_updates plu
  WHERE plu.booking_id = booking_uuid
  ORDER BY plu.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON TABLE provider_location_updates IS 'Real-time GPS location updates from providers during at-home service journeys';
COMMENT ON COLUMN provider_location_updates.is_estimated IS 'True if location is estimated due to GPS unavailability or low accuracy';
COMMENT ON COLUMN provider_location_updates.update_type IS 'Type of update: periodic (automatic), manual (provider entered), arrival, departure';
