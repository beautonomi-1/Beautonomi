-- Add privacy settings columns to users table
-- These settings control user privacy preferences and data sharing options

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_visibility BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_information_visible BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS read_receipts_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS include_in_search_engines BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_home_city_in_reviews BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_trip_type_in_reviews BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_length_of_stay_in_reviews BOOLEAN DEFAULT false;

-- Add columns for data export and account deletion
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_export_requested_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_export_ready_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_export_download_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_deletion_requested_at TIMESTAMP WITH TIME ZONE;

-- Add index for data export requests
CREATE INDEX IF NOT EXISTS idx_users_data_export_requested ON users(data_export_requested_at) WHERE data_export_requested_at IS NOT NULL;

-- Add index for account deletion requests
CREATE INDEX IF NOT EXISTS idx_users_deletion_requested ON users(account_deletion_requested_at) WHERE account_deletion_requested_at IS NOT NULL;
