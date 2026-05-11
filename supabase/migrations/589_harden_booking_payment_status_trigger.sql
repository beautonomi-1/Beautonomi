-- Keep booking payment status derived from booking_payments/booking_refunds,
-- with explicit enum casts and tolerant paid-in-full comparison.

CREATE OR REPLACE FUNCTION update_booking_payment_status()
RETURNS TRIGGER AS $$
DECLARE
    v_booking_id UUID;
    v_total_paid NUMERIC;
    v_total_refunded NUMERIC;
    v_booking_total NUMERIC;
    v_new_status TEXT;
BEGIN
    v_booking_id := COALESCE(NEW.booking_id, OLD.booking_id);

    SELECT total_amount INTO v_booking_total
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

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_booking_payment_status IS
  'Updates bookings.payment_status from booking_payments and refunds with explicit enum casts and paid tolerance.';
