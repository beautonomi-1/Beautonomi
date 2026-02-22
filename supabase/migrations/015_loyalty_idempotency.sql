-- Beautonomi Database Migration
-- 015_loyalty_idempotency.sql
-- Prevent duplicate loyalty ledger credits for the same booking

-- For booking-related loyalty earnings, ensure idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uniq_loyalty_earned_per_booking
  ON loyalty_point_transactions(user_id, reference_id, reference_type, transaction_type)
  WHERE reference_type = 'booking' AND transaction_type = 'earned' AND reference_id IS NOT NULL;

