-- Migration 596: Backfill bookings.payment_reference from booking_payments
--
-- booking_payments stores gateway reference on payment_provider_id (Paystack ref, etc.).

UPDATE bookings b
SET payment_reference = bp.payment_provider_id
FROM booking_payments bp
WHERE bp.booking_id = b.id
  AND (b.payment_reference IS NULL OR b.payment_reference = '')
  AND bp.payment_provider_id IS NOT NULL
  AND bp.payment_provider_id <> ''
  AND bp.status = 'completed'
  AND bp.created_at = (
    SELECT MAX(bp2.created_at)
    FROM booking_payments bp2
    WHERE bp2.booking_id = b.id
      AND bp2.status = 'completed'
      AND bp2.payment_provider_id IS NOT NULL
      AND bp2.payment_provider_id <> ''
  );
