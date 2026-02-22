-- Beautonomi Database Migration
-- 017_paystack_splits_schema_align.sql
-- Align paystack_splits table schema with API usage in /api/paystack/splits

ALTER TABLE paystack_splits
  ADD COLUMN IF NOT EXISTS split_id BIGINT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS bearer_type TEXT,
  ADD COLUMN IF NOT EXISTS bearer_subaccount TEXT;

