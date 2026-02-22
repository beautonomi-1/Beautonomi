-- ============================================================================
-- Migration 169: Create Finance Transactions from Booking Payments
-- ============================================================================
-- This migration adds a trigger that automatically creates finance ledger 
-- entries when a booking payment is recorded (cash, card terminal, etc.)
-- This ensures cash/offline payments show up on the provider dashboard.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_finance_ledger_from_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_booking RECORD;
    v_platform_commission_rate NUMERIC := 0.15; -- 15% default platform commission
    v_platform_commission NUMERIC;
    v_provider_earnings NUMERIC;
    v_commission_base NUMERIC;
BEGIN
    -- Only process completed payments
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;
    
    -- Get booking details
    SELECT 
        b.id,
        b.booking_number,
        b.provider_id,
        b.total_amount,
        COALESCE(b.service_fee_amount, 0) as service_fee_amount,
        COALESCE(b.tip_amount, 0) as tip_amount,
        COALESCE(b.tax_amount, 0) as tax_amount,
        COALESCE(b.travel_fee, 0) as travel_fee
    INTO v_booking
    FROM bookings b
    WHERE b.id = NEW.booking_id;
    
    IF NOT FOUND THEN
        RAISE WARNING 'Booking not found for payment: %', NEW.booking_id;
        RETURN NEW;
    END IF;
    
    -- Check if finance transactions already exist for this booking
    -- (to avoid duplicates if trigger fires multiple times)
    IF EXISTS (
        SELECT 1 FROM finance_transactions 
        WHERE booking_id = NEW.booking_id 
        AND transaction_type = 'provider_earnings'
    ) THEN
        RAISE NOTICE 'Finance transactions already exist for booking %, skipping creation', v_booking.booking_number;
        RETURN NEW;
    END IF;
    
    -- Calculate commission and provider earnings
    -- Base amount for commission = total - (service_fee + tax + travel_fee)
    v_commission_base := v_booking.total_amount - 
                         v_booking.service_fee_amount - 
                         v_booking.tax_amount - 
                         v_booking.travel_fee;
    
    v_platform_commission := v_commission_base * v_platform_commission_rate;
    v_provider_earnings := v_commission_base - v_platform_commission;
    
    RAISE NOTICE 'Creating finance transactions for booking %: total=%, commission_base=%, platform_commission=%, provider_earnings=%', 
        v_booking.booking_number, v_booking.total_amount, v_commission_base, v_platform_commission, v_provider_earnings;
    
    -- 1. Platform commission entry (payment type)
    INSERT INTO finance_transactions (
        booking_id,
        provider_id,
        transaction_type,
        amount,
        fees,
        commission,
        net,
        description,
        created_at
    ) VALUES (
        NEW.booking_id,
        v_booking.provider_id,
        'payment',
        v_commission_base,
        0,
        v_platform_commission,
        v_platform_commission,
        'Payment for booking ' || v_booking.booking_number || ' (via ' || NEW.payment_method || ')',
        NOW()
    );
    
    -- 2. Provider earnings entry
    INSERT INTO finance_transactions (
        booking_id,
        provider_id,
        transaction_type,
        amount,
        fees,
        commission,
        net,
        description,
        created_at
    ) VALUES (
        NEW.booking_id,
        v_booking.provider_id,
        'provider_earnings',
        v_provider_earnings,
        0,
        0,
        v_provider_earnings,
        'Provider earnings for booking ' || v_booking.booking_number || ' (via ' || NEW.payment_method || ')',
        NOW()
    );
    
    -- 3. Service fee entry (if applicable)
    IF v_booking.service_fee_amount > 0 THEN
        INSERT INTO finance_transactions (
            booking_id,
            provider_id,
            transaction_type,
            amount,
            fees,
            commission,
            net,
            description,
            created_at
        ) VALUES (
            NEW.booking_id,
            v_booking.provider_id,
            'service_fee',
            v_booking.service_fee_amount,
            0,
            0,
            v_booking.service_fee_amount,
            'Service fee for booking ' || v_booking.booking_number,
            NOW()
        );
    END IF;
    
    -- 4. Tip entry (if applicable)
    IF v_booking.tip_amount > 0 THEN
        INSERT INTO finance_transactions (
            booking_id,
            provider_id,
            transaction_type,
            amount,
            fees,
            commission,
            net,
            description,
            created_at
        ) VALUES (
            NEW.booking_id,
            v_booking.provider_id,
            'tip',
            v_booking.tip_amount,
            0,
            0,
            v_booking.tip_amount,
            'Tip for booking ' || v_booking.booking_number,
            NOW()
        );
    END IF;
    
    -- 5. Tax entry (if applicable)
    IF v_booking.tax_amount > 0 THEN
        INSERT INTO finance_transactions (
            booking_id,
            provider_id,
            transaction_type,
            amount,
            fees,
            commission,
            net,
            description,
            created_at
        ) VALUES (
            NEW.booking_id,
            v_booking.provider_id,
            'tax',
            v_booking.tax_amount,
            0,
            0,
            v_booking.tax_amount,
            'Tax for booking ' || v_booking.booking_number,
            NOW()
        );
    END IF;
    
    -- 6. Travel fee entry (if applicable)
    IF v_booking.travel_fee > 0 THEN
        INSERT INTO finance_transactions (
            booking_id,
            provider_id,
            transaction_type,
            amount,
            fees,
            commission,
            net,
            description,
            created_at
        ) VALUES (
            NEW.booking_id,
            v_booking.provider_id,
            'travel_fee',
            v_booking.travel_fee,
            0,
            0,
            v_booking.travel_fee,
            'Travel fee for booking ' || v_booking.booking_number,
            NOW()
        );
    END IF;
    
    RAISE NOTICE 'Finance transactions created successfully for booking % via %', v_booking.booking_number, NEW.payment_method;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error creating finance transactions for booking %: %', NEW.booking_id, SQLERRM;
        -- Don't fail the payment record creation if finance transaction fails
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS create_finance_ledger_on_payment ON booking_payments;

-- Create trigger
CREATE TRIGGER create_finance_ledger_on_payment
    AFTER INSERT ON booking_payments
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION create_finance_ledger_from_payment();

-- Add comment
COMMENT ON FUNCTION create_finance_ledger_from_payment IS 'Automatically creates finance ledger entries when a booking payment is recorded (cash/card/offline payments). Ensures all payments show up on provider dashboard.';
COMMENT ON TRIGGER create_finance_ledger_on_payment ON booking_payments IS 'Creates finance transactions for cash/offline payments to ensure they appear on provider dashboard';
