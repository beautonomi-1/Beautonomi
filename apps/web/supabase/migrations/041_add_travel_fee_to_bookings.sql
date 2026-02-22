-- Beautonomi Database Migration
-- 041_add_travel_fee_to_bookings.sql
-- Adds travel_fee column to bookings table for at-home services

-- Add travel_fee column to bookings table
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS travel_fee NUMERIC(10, 2) DEFAULT 0 CHECK (travel_fee >= 0);

-- Add platform_service_fee column to bookings table
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS platform_service_fee NUMERIC(10, 2) DEFAULT 0 CHECK (platform_service_fee >= 0);

-- Add comment to clarify travel fees are only for at-home bookings
COMMENT ON COLUMN bookings.travel_fee IS 'Travel fee for at-home services only. Should be 0 for at_salon bookings.';

-- Add comment for platform service fee
COMMENT ON COLUMN bookings.platform_service_fee IS 'Platform service fee charged to customer. This is separate from provider earnings.';

-- Create index for filtering at-home bookings with travel fees
CREATE INDEX IF NOT EXISTS idx_bookings_travel_fee_at_home 
ON bookings(travel_fee, location_type) 
WHERE location_type = 'at_home' AND travel_fee > 0;

-- Update existing bookings to ensure travel_fee is 0 for at_salon bookings
UPDATE bookings
SET travel_fee = 0
WHERE location_type = 'at_salon' AND (travel_fee IS NULL OR travel_fee > 0);
