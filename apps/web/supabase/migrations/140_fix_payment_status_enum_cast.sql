-- ============================================================================
-- Migration 140: Fix payment_status enum casting in trigger
-- ============================================================================
-- This migration fixes the update_booking_payment_status() trigger function
-- to properly cast TEXT values to the payment_status enum type.
-- ============================================================================

-- Update the trigger function to properly cast enum values
CREATE OR REPLACE FUNCTION update_booking_payment_status()
RETURNS TRIGGER AS $$
DECLARE
    v_total_paid NUMERIC;
    v_total_refunded NUMERIC;
    v_booking_total NUMERIC;
    v_new_status TEXT;
BEGIN
    -- Get booking total
    SELECT total_amount INTO v_booking_total
    FROM bookings
    WHERE id = COALESCE(NEW.booking_id, OLD.booking_id);
    
    -- Calculate total paid
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM booking_payments
    WHERE booking_id = COALESCE(NEW.booking_id, OLD.booking_id)
    AND status IN ('completed', 'partially_refunded');
    
    -- Calculate total refunded
    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded
    FROM booking_refunds
    WHERE booking_id = COALESCE(NEW.booking_id, OLD.booking_id)
    AND status = 'completed';
    
    -- Determine new status
    IF v_total_paid = 0 THEN
        v_new_status := 'pending';
    ELSIF v_total_refunded >= v_total_paid THEN
        v_new_status := 'refunded';
    ELSIF v_total_paid >= v_booking_total THEN
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
    
    -- Update booking with proper enum casting
    -- Cast the TEXT value to payment_status enum type
    UPDATE bookings 
    SET 
        payment_status = v_new_status::payment_status,
        total_paid = v_total_paid,
        total_refunded = v_total_refunded
    WHERE id = COALESCE(NEW.booking_id, OLD.booking_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Comment
COMMENT ON FUNCTION update_booking_payment_status IS 'Automatically updates booking payment status based on payments and refunds. Fixed to properly cast enum values.';
