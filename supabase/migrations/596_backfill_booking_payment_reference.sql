-- Migration 596: Backfill bookings.payment_reference from booking_payments.reference
--
-- Context (Paystack audit 2026-05):
--   /api/paystack/initialize historically did not persist the Paystack reference back
--   to bookings.payment_reference. Webhooks work fine (they match on metadata.booking_id),
--   but admin reconciliation by reference fails for those bookings.
--
-- Fix:
--   1. Backfill missing payment_reference from booking_payments.reference where the
--      payment was completed and the booking has no payment_reference yet.
--   2. A server-side guard (in /api/paystack/initialize) now writes payment_reference
--      on every future call, so this migration only needs to cover historical rows.

-- Backfill bookings.payment_reference from booking_payments where missing
UPDATE bookings b
SET payment_reference = bp.reference
FROM booking_payments bp
WHERE bp.booking_id = b.id
  AND (b.payment_reference IS NULL OR b.payment_reference = '')
  AND bp.reference IS NOT NULL
  AND bp.reference <> ''
  AND bp.status = 'completed'
  -- Use the most recent completed payment if multiple exist
  AND bp.created_at = (
    SELECT MAX(bp2.created_at)
    FROM booking_payments bp2
    WHERE bp2.booking_id = b.id
      AND bp2.status = 'completed'
      AND bp2.reference IS NOT NULL
      AND bp2.reference <> ''
  );
