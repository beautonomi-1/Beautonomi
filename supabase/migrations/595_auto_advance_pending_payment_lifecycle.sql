-- §Booking-lifecycle-coherence (audit 2026-05):
--
-- `bookings.status = 'pending_payment'` is a TRANSIENT lifecycle state set when
-- the customer is redirected to a payment provider (Paystack). Once payment
-- clears, the lifecycle is meant to advance to either:
--   - `'pending'`  → provider must manually confirm (require_confirmation_for_bookings = TRUE)
--   - `'confirmed'` → auto-confirmed (require_confirmation_for_bookings = FALSE)
--
-- Until now the auto-advance was only attempted by application code
-- (`syncBookingAfterPaystackSuccess`). That code is invoked from the Paystack
-- charge-success handler, the redirect verify-reference handler, and the
-- saved-card path — but NOT from `provider/bookings/[id]/mark-paid`, and not
-- when the webhook is delayed/dropped.  As a result bookings could remain in
-- `pending_payment` even though `payment_status = 'paid'`, producing the
-- well-known confusing UX:
--    – Customer sees "Pending payment" badge but "Paid in full" total
--    – Provider sees "Awaiting payment" but the same total paid
--    – Provider's status picker only offers "Cancel" because the legal
--      transition graph only permits cancel from `pending_payment`
--
-- This migration enforces the invariant at the DB layer (defense in depth):
--   1.  Extends `update_booking_payment_status` so that whenever it derives
--       `paid` or `partially_paid` AND the booking is currently
--       `pending_payment`, the lifecycle status advances to `pending`.
--       (We use `pending` not `confirmed` here because confirmation policy is
--       a provider setting and is enforced by application code; advancing to
--       `pending` is universally safe — it means "customer has paid; provider
--       still needs to confirm or auto-confirm rules will run".)
--
--   2.  Backfills every existing booking that is currently stuck:
--       `status = 'pending_payment'` AND `payment_status IN ('paid','partially_paid')`.
--
-- The backfill runs in a single statement; the trigger extension means new
-- bookings can never enter the stuck state again.

-- ──────────────────────────────────────────────────────────────────────────
-- 1) Extend the trigger function
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_booking_payment_status()
RETURNS TRIGGER AS $$
DECLARE
    v_booking_id UUID;
    v_total_paid NUMERIC;
    v_total_refunded NUMERIC;
    v_booking_total NUMERIC;
    v_new_status TEXT;
    v_current_lifecycle_status TEXT;
BEGIN
    v_booking_id := COALESCE(NEW.booking_id, OLD.booking_id);

    SELECT total_amount, status::TEXT
      INTO v_booking_total, v_current_lifecycle_status
    FROM bookings
    WHERE id = v_booking_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM booking_payments
    WHERE booking_id = v_booking_id
      AND status::TEXT IN ('completed', 'partially_refunded');

    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded
    FROM booking_refunds
    WHERE booking_id = v_booking_id
      AND status::TEXT = 'completed';

    IF v_total_paid = 0 THEN
        v_new_status := 'pending';
    ELSIF v_total_refunded >= v_total_paid THEN
        v_new_status := 'refunded';
    ELSIF v_booking_total IS NOT NULL AND v_total_paid + 0.01 >= v_booking_total THEN
        IF v_total_refunded > 0 THEN
            v_new_status := 'partially_refunded';
        ELSE
            v_new_status := 'paid';
        END IF;
    ELSIF v_total_paid > 0 THEN
        v_new_status := 'partially_paid';
    ELSE
        v_new_status := 'pending';
    END IF;

    UPDATE bookings
    SET payment_status = v_new_status::payment_status,
        total_paid = v_total_paid,
        total_refunded = v_total_refunded
    WHERE id = v_booking_id;

    -- Auto-advance lifecycle status out of the transient `pending_payment`
    -- when the gateway has confirmed payment. We deliberately advance to
    -- `pending` (not `confirmed`) — the application's auto-confirm rules
    -- (`require_confirmation_for_bookings`) decide whether to advance further
    -- to `confirmed`. Advancing to `pending` is the universally-safe baseline
    -- and immediately makes the provider's full action set available
    -- (Confirm / Cancel) instead of the cancel-only `pending_payment` graph.
    IF v_current_lifecycle_status = 'pending_payment'
       AND v_new_status IN ('paid', 'partially_paid', 'partially_refunded')
    THEN
        UPDATE bookings
           SET status = 'pending'::booking_status
         WHERE id = v_booking_id
           AND status = 'pending_payment'::booking_status;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_booking_payment_status IS
  'Updates bookings.payment_status from booking_payments and refunds. When payment clears (paid/partially_paid/partially_refunded) and lifecycle is still pending_payment, also advances lifecycle status to pending so provider actions and customer UX are unblocked.';


-- ──────────────────────────────────────────────────────────────────────────
-- 2) Backfill: repair any booking that is currently stuck in pending_payment
--    while already paid (or partially paid / partially refunded).
-- ──────────────────────────────────────────────────────────────────────────

UPDATE bookings
   SET status = 'pending'::booking_status
 WHERE status = 'pending_payment'::booking_status
   AND payment_status IN (
         'paid'::payment_status,
         'partially_paid'::payment_status,
         'partially_refunded'::payment_status
       );
