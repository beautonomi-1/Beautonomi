-- Beautonomi Database Migration
-- 114_add_staff_time_overrides_and_group_booking_id.sql
-- Adds staff override fields for buffer/processing/finishing time
-- Adds group_booking_id to bookings table

-- Add staff override fields to provider_staff table
ALTER TABLE public.provider_staff
ADD COLUMN IF NOT EXISTS buffer_minutes_override INTEGER,
ADD COLUMN IF NOT EXISTS processing_minutes_override INTEGER,
ADD COLUMN IF NOT EXISTS finishing_minutes_override INTEGER;

-- Add comments to explain the fields
COMMENT ON COLUMN public.provider_staff.buffer_minutes_override IS 'Staff-specific buffer time override (overrides service default)';
COMMENT ON COLUMN public.provider_staff.processing_minutes_override IS 'Staff-specific processing time override (overrides service default)';
COMMENT ON COLUMN public.provider_staff.finishing_minutes_override IS 'Staff-specific finishing time override (overrides service default)';

-- Add group_booking_id to bookings table
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS group_booking_id UUID REFERENCES group_bookings(id) ON DELETE SET NULL;

-- Create index for group_booking_id
CREATE INDEX IF NOT EXISTS idx_bookings_group_booking ON bookings(group_booking_id) WHERE group_booking_id IS NOT NULL;

-- Add primary_contact_id to bookings table (for group bookings)
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS primary_contact_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create index for primary_contact_id
CREATE INDEX IF NOT EXISTS idx_bookings_primary_contact ON bookings(primary_contact_id) WHERE primary_contact_id IS NOT NULL;
