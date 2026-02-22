-- Beautonomi Database Migration
-- 018_platform_secrets_more.sql
-- Add additional sensitive keys to platform_secrets

ALTER TABLE platform_secrets
  ADD COLUMN IF NOT EXISTS onesignal_rest_api_key TEXT,
  ADD COLUMN IF NOT EXISTS mapbox_access_token TEXT,
  ADD COLUMN IF NOT EXISTS amplitude_secret_key TEXT;

