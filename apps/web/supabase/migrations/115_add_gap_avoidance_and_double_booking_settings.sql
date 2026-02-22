-- Beautonomi Database Migration
-- 115_add_gap_avoidance_and_double_booking_settings.sql
-- Adds gap avoidance and double booking override settings to provider_settings

-- Check if provider_settings table exists, if not create it
CREATE TABLE IF NOT EXISTS public.provider_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add gap avoidance setting
ALTER TABLE public.provider_settings
ADD COLUMN IF NOT EXISTS avoid_gaps BOOLEAN DEFAULT false;

-- Add double booking override setting
ALTER TABLE public.provider_settings
ADD COLUMN IF NOT EXISTS allow_double_booking_manual BOOLEAN DEFAULT false;

-- Add comments
COMMENT ON COLUMN public.provider_settings.avoid_gaps IS 'If true, only show slots at start/end of day or adjacent to existing appointments';
COMMENT ON COLUMN public.provider_settings.allow_double_booking_manual IS 'If true, staff can manually override double booking prevention';

-- Create trigger for updated_at if it doesn't exist
DROP TRIGGER IF EXISTS update_provider_settings_updated_at ON provider_settings;
CREATE TRIGGER update_provider_settings_updated_at BEFORE UPDATE ON provider_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
