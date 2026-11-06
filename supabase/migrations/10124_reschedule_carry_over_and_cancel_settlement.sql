-- Checkout reschedule carry-over and cancellation settlement tracking.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rescheduled_from_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reschedule_credit_pending NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS reschedule_gift_pending NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS reschedule_carry_over_finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_settlement_error TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_settlement_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS bookings_rescheduled_from_idx
  ON public.bookings (rescheduled_from_booking_id)
  WHERE rescheduled_from_booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_cancel_settlement_pending_idx
  ON public.bookings (cancelled_at)
  WHERE cancellation_settled_at IS NULL AND cancellation_settlement_error IS NOT NULL;

-- Cancellations settled before this column existed. Only bookings cancelled
-- from now on get the stamp from settleBookingCancellation.
UPDATE public.bookings
SET cancellation_settled_at = COALESCE(cancelled_at, updated_at, NOW())
WHERE status IN ('cancelled', 'no_show')
  AND cancellation_settled_at IS NULL;

COMMENT ON COLUMN public.bookings.reschedule_credit_pending IS
  'Platform-held amount from the original booking to apply after the replacement booking is paid.';
COMMENT ON COLUMN public.bookings.cancellation_settled_at IS
  'Set when settleBookingCancellation finishes. Null on a cancelled booking with collected money means the refund is still pending.';
