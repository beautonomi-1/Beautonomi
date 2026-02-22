-- Beautonomi Database Migration
-- 241_provider_payment_settings_columns.sql
-- Add payment settings columns to providers table for parity between web and mobile.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS accept_cash BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS accept_card BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS accept_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_auto_send BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS tip_presets JSONB DEFAULT '[10, 15, 20, 25]',
  ADD COLUMN IF NOT EXISTS tips_distribution TEXT DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC(5, 2) DEFAULT 15;
