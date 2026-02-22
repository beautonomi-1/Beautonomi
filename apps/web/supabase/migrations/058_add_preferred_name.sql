-- Add preferred_name column to users table
-- This allows users to set a preferred name that appears to Providers and clients

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_name TEXT;

-- Add comment
COMMENT ON COLUMN users.preferred_name IS 'User preferred name that appears to Providers and clients instead of legal name';
