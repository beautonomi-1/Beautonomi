-- Beautonomi Database Migration
-- 187_enhance_house_call_address_fields.sql
-- Adds enhanced address fields for house call bookings and saved addresses

-- Add house call specific address fields to bookings table (all optional - NULL by default in PostgreSQL)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS apartment_unit TEXT,
ADD COLUMN IF NOT EXISTS building_name TEXT,
ADD COLUMN IF NOT EXISTS floor_number TEXT,
ADD COLUMN IF NOT EXISTS access_codes JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS parking_instructions TEXT,
ADD COLUMN IF NOT EXISTS location_landmarks TEXT,
ADD COLUMN IF NOT EXISTS house_call_instructions TEXT;

-- Add minimum mobile booking amount to providers (optional - NULL means no minimum)
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS minimum_mobile_booking_amount NUMERIC(10, 2);

-- Add house call specific address fields to user_addresses table (all optional - NULL by default in PostgreSQL)
ALTER TABLE user_addresses
ADD COLUMN IF NOT EXISTS apartment_unit TEXT,
ADD COLUMN IF NOT EXISTS building_name TEXT,
ADD COLUMN IF NOT EXISTS floor_number TEXT,
ADD COLUMN IF NOT EXISTS access_codes JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS parking_instructions TEXT,
ADD COLUMN IF NOT EXISTS location_landmarks TEXT;

-- Add comments for bookings table
COMMENT ON COLUMN bookings.apartment_unit IS 'Apartment or unit number for house call bookings';
COMMENT ON COLUMN bookings.building_name IS 'Building name or complex name';
COMMENT ON COLUMN bookings.floor_number IS 'Floor number if applicable';
COMMENT ON COLUMN bookings.access_codes IS 'JSON object with access codes: {gate: "1234", buzzer: "Apt 5", door: "4567"}';
COMMENT ON COLUMN bookings.parking_instructions IS 'Parking availability and instructions for provider';
COMMENT ON COLUMN bookings.location_landmarks IS 'Landmarks or directions to help provider find location';
COMMENT ON COLUMN bookings.house_call_instructions IS 'House call specific instructions separate from general special_requests';
COMMENT ON COLUMN providers.minimum_mobile_booking_amount IS 'Minimum order amount required for house call bookings. NULL means no minimum.';

-- Add comments for user_addresses table
COMMENT ON COLUMN user_addresses.apartment_unit IS 'Apartment or unit number for saved addresses';
COMMENT ON COLUMN user_addresses.building_name IS 'Building name or complex name';
COMMENT ON COLUMN user_addresses.floor_number IS 'Floor number if applicable';
COMMENT ON COLUMN user_addresses.access_codes IS 'JSON object with access codes: {gate: "1234", buzzer: "Apt 5", door: "4567"}';
COMMENT ON COLUMN user_addresses.parking_instructions IS 'Parking availability and instructions';
COMMENT ON COLUMN user_addresses.location_landmarks IS 'Landmarks or directions to help find location';

-- Create index for filtering bookings with house call instructions
CREATE INDEX IF NOT EXISTS idx_bookings_house_call_fields 
ON bookings(location_type, apartment_unit, building_name) 
WHERE location_type = 'at_home';
