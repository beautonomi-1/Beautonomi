-- Beautonomi Database Migration
-- 033_provider_tips_enabled.sql
-- Add provider setting to enable/disable tips.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS tips_enabled BOOLEAN DEFAULT true;

