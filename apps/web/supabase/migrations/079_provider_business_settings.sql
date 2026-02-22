-- 079_provider_business_settings.sql
-- Add business settings fields to providers table

-- Add business settings columns to providers table
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Africa/Johannesburg',
ADD COLUMN IF NOT EXISTS time_format TEXT DEFAULT '24h' CHECK (time_format IN ('12h', '24h')),
ADD COLUMN IF NOT EXISTS week_start TEXT DEFAULT 'monday' CHECK (week_start IN ('monday', 'sunday')),
ADD COLUMN IF NOT EXISTS appointment_color_source TEXT DEFAULT 'service' CHECK (appointment_color_source IN ('service', 'team', 'client')),
ADD COLUMN IF NOT EXISTS client_notification_language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS default_team_language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS social_media_links JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS online_booking_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS booking_advance_notice_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS booking_cancellation_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS billing_address JSONB,
ADD COLUMN IF NOT EXISTS billing_email TEXT,
ADD COLUMN IF NOT EXISTS billing_phone TEXT;

-- Add comments
COMMENT ON COLUMN providers.timezone IS 'IANA timezone identifier (e.g., Africa/Johannesburg)';
COMMENT ON COLUMN providers.time_format IS 'Time display format: 12h or 24h';
COMMENT ON COLUMN providers.week_start IS 'First day of the week: monday or sunday';
COMMENT ON COLUMN providers.appointment_color_source IS 'Source for appointment calendar colors: service, team, or client';
COMMENT ON COLUMN providers.client_notification_language IS 'Default language for client notifications';
COMMENT ON COLUMN providers.default_team_language IS 'Default language for team members';
COMMENT ON COLUMN providers.social_media_links IS 'JSON object with social media links (facebook, instagram, x, linkedin, other)';
COMMENT ON COLUMN providers.online_booking_enabled IS 'Whether online booking is enabled for this provider';
COMMENT ON COLUMN providers.booking_advance_notice_hours IS 'Minimum hours in advance for booking';
COMMENT ON COLUMN providers.booking_cancellation_hours IS 'Minimum hours before appointment for cancellation';
