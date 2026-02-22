-- Beautonomi Database Migration
-- 155_add_provider_distance_settings.sql
-- Adds distance settings columns to providers table

-- Add distance settings columns to providers table
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS max_service_distance_km NUMERIC(5, 2) DEFAULT 10.00 CHECK (max_service_distance_km >= 1 AND max_service_distance_km <= 100),
ADD COLUMN IF NOT EXISTS is_distance_filter_enabled BOOLEAN DEFAULT false;

-- Add comments
COMMENT ON COLUMN providers.max_service_distance_km IS 'Maximum distance in kilometers provider is willing to travel for house call services';
COMMENT ON COLUMN providers.is_distance_filter_enabled IS 'Whether to enable distance filtering for house call bookings';

-- Create index for distance filtering queries
CREATE INDEX IF NOT EXISTS idx_providers_distance_filter ON providers(is_distance_filter_enabled, max_service_distance_km) 
WHERE is_distance_filter_enabled = true;
