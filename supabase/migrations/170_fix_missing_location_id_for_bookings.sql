-- Migration: Fix missing location_id for existing bookings
-- This migration updates bookings that have NULL location_id but are at_salon bookings
-- It sets the location_id to the provider's first location (by creation date)

-- Update bookings with NULL location_id that are at_salon bookings
-- Prefer primary location, otherwise use first location by creation date
UPDATE bookings b
SET location_id = (
  SELECT pl.id
  FROM provider_locations pl
  WHERE pl.provider_id = b.provider_id
  ORDER BY 
    CASE WHEN pl.is_primary = true THEN 0 ELSE 1 END, -- Primary locations first
    pl.created_at ASC -- Then by creation date
  LIMIT 1
)
WHERE b.location_id IS NULL
  AND b.location_type = 'at_salon'
  AND EXISTS (
    SELECT 1
    FROM provider_locations pl
    WHERE pl.provider_id = b.provider_id
  );

-- Log the number of updated bookings
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % bookings with missing location_id', updated_count;
END $$;
