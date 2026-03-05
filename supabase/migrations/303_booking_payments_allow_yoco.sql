-- Allow 'yoco' in booking_payments.payment_provider (Yoco terminal payments)
-- 303_booking_payments_allow_yoco.sql

DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'booking_payments'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%payment_provider%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE booking_payments DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE booking_payments
  ADD CONSTRAINT booking_payments_payment_provider_check
  CHECK (payment_provider IS NULL OR payment_provider IN ('stripe', 'cash', 'paystack', 'flutterwave', 'yoco', 'other'));

COMMENT ON COLUMN booking_payments.payment_provider IS 'Payment gateway: stripe, cash, paystack, flutterwave, yoco, other';

-- Index for webhook idempotency lookup (payment_provider_id = Yoco payment id)
CREATE INDEX IF NOT EXISTS idx_booking_payments_payment_provider_id
  ON booking_payments(payment_provider_id)
  WHERE payment_provider_id IS NOT NULL;
