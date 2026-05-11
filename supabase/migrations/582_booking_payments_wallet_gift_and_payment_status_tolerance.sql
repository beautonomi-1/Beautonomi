-- Wallet / gift as first-class booking_payments + 1c tolerance on paid threshold
-- §Finance-truth 2026-05

-- 1) Widen booking_payments.payment_method to allow wallet + gift_card
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'booking_payments'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%payment_method%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE booking_payments DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE booking_payments
  ADD CONSTRAINT booking_payments_payment_method_check
  CHECK (
    payment_method IN (
      'cash',
      'card',
      'bank_transfer',
      'other',
      'wallet',
      'gift_card'
    )
  );

-- 2) Widen payment_provider for wallet / gift_card rows
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
  CHECK (
    payment_provider IS NULL
    OR payment_provider IN (
      'stripe',
      'cash',
      'paystack',
      'flutterwave',
      'yoco',
      'other',
      'wallet',
      'gift_card'
    )
  );

-- 3) payment_status trigger: treat as fully paid within 0.01 of total_amount
CREATE OR REPLACE FUNCTION update_booking_payment_status()
RETURNS TRIGGER AS $$
DECLARE
    v_total_paid NUMERIC;
    v_total_refunded NUMERIC;
    v_booking_total NUMERIC;
    v_new_status TEXT;
BEGIN
    SELECT total_amount INTO v_booking_total
    FROM bookings
    WHERE id = COALESCE(NEW.booking_id, OLD.booking_id);

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM booking_payments
    WHERE booking_id = COALESCE(NEW.booking_id, OLD.booking_id)
    AND status IN ('completed', 'partially_refunded');

    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded
    FROM booking_refunds
    WHERE booking_id = COALESCE(NEW.booking_id, OLD.booking_id)
    AND status = 'completed';

    IF v_total_paid = 0 THEN
        v_new_status := 'pending';
    ELSIF v_total_refunded >= v_total_paid THEN
        v_new_status := 'refunded';
    ELSIF v_booking_total IS NOT NULL AND v_total_paid + 0.01 >= v_booking_total THEN
        IF v_total_refunded > 0 THEN
            v_new_status := 'partially_paid';
        ELSE
            v_new_status := 'paid';
        END IF;
    ELSIF v_total_paid > 0 THEN
        v_new_status := 'partially_paid';
    ELSE
        v_new_status := 'pending';
    END IF;

    UPDATE bookings
    SET
        payment_status = v_new_status::payment_status,
        total_paid = v_total_paid,
        total_refunded = v_total_refunded
    WHERE id = COALESCE(NEW.booking_id, OLD.booking_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_booking_payment_status IS
  'Updates booking payment_status from booking_payments + refunds; paid when total_paid + 0.01 >= total_amount.';

-- 4) Backfill synthetic rows for historic wallet / gift settlements (idempotent)
INSERT INTO booking_payments (
  booking_id,
  tenant_id,
  amount,
  payment_method,
  payment_provider,
  payment_provider_id,
  status,
  notes,
  payment_provider_data
)
SELECT
  b.id,
  b.tenant_id,
  ROUND(b.wallet_amount::numeric, 2),
  'wallet',
  'wallet',
  'wallet_booking:' || b.id::text,
  'completed',
  'Backfill: wallet spend (migration 582)',
  jsonb_build_object('source', 'migration_582_wallet_backfill')
FROM bookings b
WHERE COALESCE(b.wallet_amount, 0) > 0.01
  AND NOT EXISTS (
    SELECT 1
    FROM booking_payments bp
    WHERE bp.booking_id = b.id
      AND bp.payment_provider_id = 'wallet_booking:' || b.id::text
  );

INSERT INTO booking_payments (
  booking_id,
  tenant_id,
  amount,
  payment_method,
  payment_provider,
  payment_provider_id,
  status,
  notes,
  payment_provider_data
)
SELECT
  b.id,
  b.tenant_id,
  ROUND(b.gift_card_amount::numeric, 2),
  'gift_card',
  'gift_card',
  'gift_card_booking:' || b.id::text,
  'completed',
  'Backfill: gift card redemption (migration 582)',
  jsonb_build_object('source', 'migration_582_gift_backfill')
FROM bookings b
WHERE COALESCE(b.gift_card_amount, 0) > 0.01
  AND NOT EXISTS (
    SELECT 1
    FROM booking_payments bp
    WHERE bp.booking_id = b.id
      AND bp.payment_provider_id = 'gift_card_booking:' || b.id::text
  );
