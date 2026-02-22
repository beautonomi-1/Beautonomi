-- Add tax_info, vat_id, and notification_preferences columns to user_profiles table
-- These columns store tax information, VAT ID, and notification preferences for users

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS tax_info JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS vat_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.tax_info IS 'Stores tax information including country, tax_id, full_name, and address';
COMMENT ON COLUMN user_profiles.vat_id IS 'Stores VAT ID number for VAT-registered users';
COMMENT ON COLUMN user_profiles.notification_preferences IS 'Stores notification preferences for email, SMS, and push notifications';
