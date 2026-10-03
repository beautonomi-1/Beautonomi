-- Beautonomi Database Migration
-- 577_provider_gift_card_settings.sql
-- Add gift card settings columns to providers table

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS gift_cards_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS custom_gift_card_min_value NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS custom_gift_card_max_value NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS custom_gift_card_expiry_months INTEGER;
