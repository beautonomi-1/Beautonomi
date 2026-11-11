-- =============================================================================
-- 10145_refund_amount_row_lock.sql
-- T4.3  validate_refund_amount read the paid and already-refunded totals
--        without locking the booking. Two concurrent refunds that each fit
--        the remaining balance could both commit. Lock the booking row, then
--        the payment row, so the second session waits and then sees the first.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_refund_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  payment_amount NUMERIC(12, 2);
  total_refunded_for_payment NUMERIC(12, 2);
  booking_total_paid NUMERIC(12, 2);
  payments_total_paid NUMERIC(12, 2);
  new_total_refunded NUMERIC(12, 2);
BEGIN
  -- Serialize refunds for this booking before any total is read.
  PERFORM 1 FROM public.bookings WHERE id = NEW.booking_id FOR UPDATE;

  IF NEW.payment_id IS NOT NULL THEN
    SELECT amount INTO payment_amount
    FROM public.booking_payments
    WHERE id = NEW.payment_id
    FOR UPDATE;

    IF payment_amount IS NULL THEN
      RAISE EXCEPTION 'Payment with id % does not exist', NEW.payment_id;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO total_refunded_for_payment
    FROM public.booking_refunds
    WHERE payment_id = NEW.payment_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
      AND status = 'completed';

    IF (total_refunded_for_payment + NEW.amount) > payment_amount + 0.005 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('Refund amount validation failed. Total refunded for payment (%s + %s) = %s exceeds payment amount (%s)',
                        total_refunded_for_payment, NEW.amount, (total_refunded_for_payment + NEW.amount), payment_amount),
        HINT = format('Total refunds for this payment cannot exceed %s. Current refunds: %s, New refund: %s',
                     payment_amount, total_refunded_for_payment, NEW.amount);
    END IF;
  END IF;

  SELECT total_paid INTO booking_total_paid FROM public.bookings WHERE id = NEW.booking_id;

  SELECT COALESCE(SUM(amount), 0) INTO payments_total_paid
  FROM public.booking_payments
  WHERE booking_id = NEW.booking_id AND status = 'completed';

  booking_total_paid := GREATEST(COALESCE(booking_total_paid, 0), COALESCE(payments_total_paid, 0));

  SELECT COALESCE(SUM(amount), 0) INTO new_total_refunded
  FROM public.booking_refunds
  WHERE booking_id = NEW.booking_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND status = 'completed';

  new_total_refunded := new_total_refunded + NEW.amount;

  IF booking_total_paid > 0 THEN
    IF new_total_refunded > booking_total_paid + 0.005 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('Refund amount validation failed. Total refunded for booking (%s) exceeds total paid (%s)',
                        new_total_refunded, booking_total_paid),
        HINT = 'Refunds for a booking cannot exceed the amount paid. Check booking_payments and booking_refunds.';
    END IF;
  ELSIF new_total_refunded > 0 THEN
    RAISE WARNING 'Refund % on booking % with no recorded completed payments (total_paid=%). Recorded for reconciliation.',
      NEW.amount, NEW.booking_id, booking_total_paid;
  END IF;

  RETURN NEW;
END;
$function$;
