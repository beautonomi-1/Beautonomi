-- ============================================================================
-- Migration 141: Provider Appointment Settings
-- ============================================================================
-- Adds appointment-related settings to providers table for dynamic configuration
-- ============================================================================

-- Add appointment settings columns to providers table
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS default_appointment_status TEXT DEFAULT 'booked' 
  CHECK (default_appointment_status IN ('pending', 'booked', 'started', 'completed', 'cancelled', 'no_show')),
ADD COLUMN IF NOT EXISTS auto_confirm_appointments BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS require_confirmation_for_bookings BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS appointment_settings_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_providers_appointment_settings 
  ON providers(id) 
  WHERE default_appointment_status IS NOT NULL;

-- Add comment
COMMENT ON COLUMN providers.default_appointment_status IS 'Default status for new appointments. Valid values: pending, booked, started, completed, cancelled, no_show';
COMMENT ON COLUMN providers.auto_confirm_appointments IS 'If true, automatically confirm appointments when created';
COMMENT ON COLUMN providers.require_confirmation_for_bookings IS 'If true, appointments require manual confirmation before being marked as booked';

-- Create function to update appointment_settings_updated_at timestamp
CREATE OR REPLACE FUNCTION update_provider_appointment_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.default_appointment_status IS DISTINCT FROM OLD.default_appointment_status OR
     NEW.auto_confirm_appointments IS DISTINCT FROM OLD.auto_confirm_appointments OR
     NEW.require_confirmation_for_bookings IS DISTINCT FROM OLD.require_confirmation_for_bookings THEN
    NEW.appointment_settings_updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update timestamp
DROP TRIGGER IF EXISTS trigger_update_provider_appointment_settings_timestamp ON providers;
CREATE TRIGGER trigger_update_provider_appointment_settings_timestamp
  BEFORE UPDATE ON providers
  FOR EACH ROW
  EXECUTE FUNCTION update_provider_appointment_settings_timestamp();

-- Add RLS policies if needed (assuming providers table already has RLS)
-- Providers can view their own settings
-- Providers can update their own settings (handled by existing policies)
