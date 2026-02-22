-- Beautonomi Database Migration
-- 035_provider_receipt_settings.sql
-- Adds provider receipt/invoice configuration fields.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS receipt_prefix TEXT DEFAULT 'REC',
  ADD COLUMN IF NOT EXISTS receipt_next_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS receipt_header TEXT,
  ADD COLUMN IF NOT EXISTS receipt_footer TEXT;

