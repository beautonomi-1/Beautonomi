-- Beautonomi Database Migration
-- 102_add_staff_to_custom_offers.sql
-- Add staff assignment support to custom offers for calendar and appointment compatibility

-- Add staff_id column to custom_offers table
ALTER TABLE custom_offers
ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL;

-- Create index for staff filtering
CREATE INDEX IF NOT EXISTS idx_custom_offers_staff ON custom_offers(staff_id);

-- Add comment
COMMENT ON COLUMN custom_offers.staff_id IS 'Assigned staff member for this custom offer. When offer is accepted and converted to booking, this staff will be assigned to the booking service.';
