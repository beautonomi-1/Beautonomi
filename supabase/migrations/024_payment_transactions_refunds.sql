-- Beautonomi Database Migration
-- 024_payment_transactions_refunds.sql
-- Align payment_transactions schema with refund + typed transactions usage in APIs

-- Add missing columns used by refund/admin flows
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'charge',
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS refund_reference TEXT,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refunded_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Expand status enum (original constraint name is deterministic in Postgres)
ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_status_check;

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('success', 'failed', 'pending', 'refunded', 'partially_refunded'));

-- Add a light constraint for transaction_type values used in code
ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_transaction_type_check;

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_transaction_type_check
  CHECK (transaction_type IN ('charge', 'refund', 'additional_charge'));

CREATE INDEX IF NOT EXISTS idx_payment_transactions_type_created_at
  ON payment_transactions(transaction_type, created_at DESC);

