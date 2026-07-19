-- 801: restore wallet/gift_card to booking_payments.payment_provider CHECK
--
-- Migration 770 re-added the payment_provider CHECK when introducing paycloud but
-- dropped wallet and gift_card (582 had widened the list). Without this fix,
-- wallet/gift checkout inserts fail at the DB layer.

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

ALTER TABLE public.booking_payments
  ADD CONSTRAINT booking_payments_payment_provider_check
  CHECK (
    payment_provider IS NULL
    OR payment_provider IN (
      'stripe',
      'cash',
      'paystack',
      'flutterwave',
      'yoco',
      'paycloud',
      'other',
      'wallet',
      'gift_card'
    )
  );
