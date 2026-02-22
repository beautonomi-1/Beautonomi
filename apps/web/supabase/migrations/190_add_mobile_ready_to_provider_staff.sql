-- Add mobile_ready column to provider_staff table
-- This field indicates whether a staff member can perform mobile/at-home services

ALTER TABLE provider_staff 
ADD COLUMN IF NOT EXISTS mobile_ready BOOLEAN DEFAULT false;

-- Add comment to explain the column
COMMENT ON COLUMN provider_staff.mobile_ready IS 'Indicates whether the staff member can perform mobile/at-home services';

-- Create index for efficient filtering of mobile-ready staff
CREATE INDEX IF NOT EXISTS idx_provider_staff_mobile_ready 
ON provider_staff(mobile_ready) 
WHERE mobile_ready = true;

-- Update existing freelancer staff to be mobile-ready by default
-- This is a one-time migration for existing data
UPDATE provider_staff ps
SET mobile_ready = true
FROM providers p
WHERE ps.provider_id = p.id 
  AND p.business_type = 'freelancer'
  AND ps.role = 'owner'
  AND (ps.mobile_ready IS NULL OR ps.mobile_ready = false);
