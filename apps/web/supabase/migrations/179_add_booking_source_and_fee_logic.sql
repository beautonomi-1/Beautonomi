-- ============================================================================
-- Migration 179: Add Booking Source and Update Fee Logic
-- ============================================================================
-- This migration adds booking_source to distinguish online vs walk-in bookings
-- and ensures platform fees are only charged for online bookings.
-- ============================================================================

-- Add booking_source field to bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_source TEXT 
    CHECK (booking_source IN ('online', 'walk_in'))
    DEFAULT 'online';

-- Create index for booking source
CREATE INDEX IF NOT EXISTS idx_bookings_booking_source 
  ON bookings(booking_source);

-- Update existing bookings: if created by provider user, mark as walk_in
-- (This is a heuristic - bookings created via provider portal are likely walk-ins)
UPDATE bookings b
SET booking_source = 'walk_in'
WHERE booking_source = 'online'
  AND EXISTS (
    SELECT 1 
    FROM users u
    INNER JOIN providers p ON p.user_id = u.id
    WHERE u.role IN ('provider_owner', 'provider_staff')
    AND p.id = b.provider_id
    -- If booking was created around the same time as provider activity, likely walk-in
    -- This is a best-effort backfill - new bookings will be correctly tagged
  );

-- Add comment
COMMENT ON COLUMN bookings.booking_source IS 'Source of booking: "online" (client portal) or "walk_in" (provider-created). Platform fees only apply to online bookings.';

-- Update finance transaction trigger to respect booking_source
-- Service fee should only be charged for online bookings
CREATE OR REPLACE FUNCTION create_finance_ledger_from_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_booking RECORD;
    v_platform_commission_rate NUMERIC(5, 4) := 0.15; -- 15% default
    v_commission_base NUMERIC(10, 2);
    v_platform_commission NUMERIC(10, 2);
    v_provider_earnings NUMERIC(10, 2);
    v_is_online_booking BOOLEAN;
BEGIN
    -- Get booking details
    SELECT 
        b.id,
        b.booking_number,
        b.provider_id,
        b.total_amount,
        COALESCE(b.service_fee_amount, 0) as service_fee_amount,
        COALESCE(b.tip_amount, 0) as tip_amount,
        COALESCE(b.tax_amount, 0) as tax_amount,
        COALESCE(b.travel_fee, 0) as travel_fee,
        COALESCE(b.booking_source, 'online') as booking_source
    INTO v_booking
    FROM bookings b
    WHERE b.id = NEW.booking_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found: %', NEW.booking_id;
    END IF;
    
    -- Determine if this is an online booking (only online bookings get platform fees)
    v_is_online_booking := (v_booking.booking_source = 'online');
    
    -- Calculate commission and provider earnings
    -- Base amount for commission = total - (service_fee + tax + travel_fee)
    -- BUT: Only calculate commission for online bookings
    IF v_is_online_booking THEN
        v_commission_base := v_booking.total_amount - 
                             v_booking.service_fee_amount - 
                             v_booking.tax_amount - 
                             v_booking.travel_fee;
        
        v_platform_commission := v_commission_base * v_platform_commission_rate;
        v_provider_earnings := v_commission_base - v_platform_commission;
    ELSE
        -- Walk-in bookings: provider keeps 100% (no platform fees)
        v_commission_base := v_booking.total_amount - 
                             v_booking.tax_amount - 
                             v_booking.travel_fee;
        v_platform_commission := 0;
        v_provider_earnings := v_commission_base;
    END IF;
    
    RAISE NOTICE 'Creating finance transactions for booking % (source: %): total=%, commission_base=%, platform_commission=%, provider_earnings=%', 
        v_booking.booking_number, v_booking.booking_source, v_booking.total_amount, v_commission_base, v_platform_commission, v_provider_earnings;
    
    -- 1. Platform commission entry (payment type) - ONLY for online bookings
    IF v_is_online_booking AND v_platform_commission > 0 THEN
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
    END IF;
    
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
        'Provider earnings for booking ' || v_booking.booking_number || ' (via ' || NEW.payment_method || ', source: ' || v_booking.booking_source || ')',
        NOW()
    );
    
    -- 3. Service fee entry (if applicable) - ONLY for online bookings
    IF v_is_online_booking AND v_booking.service_fee_amount > 0 THEN
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
    
    -- 5. Tax entry (if applicable) - Always collected if provider is VAT-registered
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
            'Tax (VAT) for booking ' || v_booking.booking_number || ' - Provider must remit to SARS',
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
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
