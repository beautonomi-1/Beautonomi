-- Beautonomi Database Migration
-- 103_profile_enhancements.sql
-- Adds handle, beauty_preferences, privacy_settings, and emergency contact email fields

-- Add handle to users table (for @username)
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_country_code TEXT;

-- Add email_verified and phone_verified flags to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

-- Create unique index on handle (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle_unique ON users(LOWER(handle)) WHERE handle IS NOT NULL;

-- Add beauty_preferences JSONB to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS beauty_preferences JSONB DEFAULT '{}';

-- Add privacy_settings JSONB to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{"services_booked_visible": false}';

-- Create index for beauty_preferences queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_beauty_preferences ON user_profiles USING GIN (beauty_preferences);

-- Comments
COMMENT ON COLUMN users.handle IS 'Unique username/handle for the user (e.g., @username)';
COMMENT ON COLUMN users.preferred_name IS 'User preferred name (display name)';
COMMENT ON COLUMN users.email_verified IS 'Whether the user email has been verified';
COMMENT ON COLUMN users.phone_verified IS 'Whether the user phone has been verified';
COMMENT ON COLUMN user_profiles.beauty_preferences IS 'JSON object storing beauty-related preferences (hair_type, skin_type, allergies, etc.)';
COMMENT ON COLUMN user_profiles.privacy_settings IS 'JSON object storing privacy preferences (services_booked_visible, etc.)';
