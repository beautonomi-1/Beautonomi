-- Beautonomi Database Migration
-- 098_add_processing_finishing_times.sql
-- Adds processing_minutes and finishing_minutes to offerings table for segment scheduling

-- Add processing_minutes and finishing_minutes to offerings table
ALTER TABLE public.offerings
ADD COLUMN IF NOT EXISTS processing_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS finishing_minutes INTEGER DEFAULT 0;

-- Add comments to explain the fields
COMMENT ON COLUMN public.offerings.processing_minutes IS 'Time after service + buffer when provider is AVAILABLE (can book new appointments during this time)';
COMMENT ON COLUMN public.offerings.finishing_minutes IS 'Time after processing when provider is BLOCKED again (cleanup, notes, etc.)';

-- Update existing bookings to include processing/finishing from offerings
-- This is a one-time migration for existing booking_services
-- Note: This assumes booking_services already has these fields or they're loaded from offerings

-- Create index for faster queries when filtering by processing/finishing times
CREATE INDEX IF NOT EXISTS idx_offerings_processing_finishing ON offerings(processing_minutes, finishing_minutes) WHERE processing_minutes > 0 OR finishing_minutes > 0;
