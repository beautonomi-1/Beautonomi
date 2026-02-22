-- Migration: Calendar OAuth Credentials
-- 142_calendar_oauth_credentials.sql
-- Adds calendar OAuth credentials to platform_secrets table

-- Add calendar OAuth columns to platform_secrets
ALTER TABLE platform_secrets
ADD COLUMN IF NOT EXISTS google_calendar_client_id TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_client_secret TEXT,
ADD COLUMN IF NOT EXISTS outlook_client_id TEXT,
ADD COLUMN IF NOT EXISTS outlook_client_secret TEXT;

-- Add comment
COMMENT ON COLUMN platform_secrets.google_calendar_client_id IS 'Google Calendar OAuth Client ID (for centralized calendar integration)';
COMMENT ON COLUMN platform_secrets.google_calendar_client_secret IS 'Google Calendar OAuth Client Secret (for centralized calendar integration)';
COMMENT ON COLUMN platform_secrets.outlook_client_id IS 'Microsoft Outlook OAuth Client ID (for centralized calendar integration)';
COMMENT ON COLUMN platform_secrets.outlook_client_secret IS 'Microsoft Outlook OAuth Client Secret (for centralized calendar integration)';
