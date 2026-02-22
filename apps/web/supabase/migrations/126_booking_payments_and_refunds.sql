-- ============================================================================
-- Migration 126: Booking Payments & Refunds Tracking
-- ============================================================================
-- This migration adds:
-- 1. Payment tracking for bookings
-- 2. Refund management
-- 3. Payment history
-- ============================================================================

-- Create booking_payments table
CREATE TABLE IF NOT EXISTS booking_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'other')),
    payment_provider TEXT CHECK (payment_provider IN ('stripe', 'cash', 'paystack', 'flutterwave', 'other')),
    payment_provider_id TEXT, -- Stripe payment intent ID, etc.
    payment_provider_data JSONB DEFAULT '{}', -- Additional provider data
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'partially_refunded')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create booking_refunds table
CREATE TABLE IF NOT EXISTS booking_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES booking_payments(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    refund_method TEXT CHECK (refund_method IN ('original', 'cash', 'store_credit')),
    refund_provider_id TEXT, -- Stripe refund ID, etc.
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add payment status to bookings if not exists
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'partially_paid', 'refunded', 'failed')),
ADD COLUMN IF NOT EXISTS total_paid NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_refunded NUMERIC(10, 2) DEFAULT 0;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking ON booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_status ON booking_payments(status);
CREATE INDEX IF NOT EXISTS idx_booking_payments_method ON booking_payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_booking_payments_created ON booking_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_booking_refunds_booking ON booking_refunds(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_refunds_payment ON booking_refunds(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_refunds_status ON booking_refunds(status);

-- Triggers
DROP TRIGGER IF EXISTS update_booking_payments_updated_at ON booking_payments;
CREATE TRIGGER update_booking_payments_updated_at 
    BEFORE UPDATE ON booking_payments
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_booking_refunds_updated_at ON booking_refunds;
CREATE TRIGGER update_booking_refunds_updated_at 
    BEFORE UPDATE ON booking_refunds
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update booking payment status automatically
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
    
    -- Update booking
    UPDATE bookings 
    SET 
        payment_status = v_new_status,
        total_paid = v_total_paid,
        total_refunded = v_total_refunded
    WHERE id = COALESCE(NEW.booking_id, OLD.booking_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating payment status
DROP TRIGGER IF EXISTS update_booking_payment_status_on_payment ON booking_payments;
CREATE TRIGGER update_booking_payment_status_on_payment
    AFTER INSERT OR UPDATE OR DELETE ON booking_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_booking_payment_status();

DROP TRIGGER IF EXISTS update_booking_payment_status_on_refund ON booking_refunds;
CREATE TRIGGER update_booking_payment_status_on_refund
    AFTER INSERT OR UPDATE OR DELETE ON booking_refunds
    FOR EACH ROW
    EXECUTE FUNCTION update_booking_payment_status();

-- RLS Policies
ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_refunds ENABLE ROW LEVEL SECURITY;

-- Customers can view own payments
DROP POLICY IF EXISTS "Customers can view own payments" ON booking_payments;
CREATE POLICY "Customers can view own payments"
    ON booking_payments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_payments.booking_id
            AND bookings.customer_id = auth.uid()
        )
    );

-- Providers can view and manage payments for own bookings
DROP POLICY IF EXISTS "Providers can manage payments" ON booking_payments;
CREATE POLICY "Providers can manage payments"
    ON booking_payments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_payments.booking_id
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = bookings.provider_id
                AND (
                    providers.user_id = auth.uid() OR
                    EXISTS (
                        SELECT 1 FROM provider_staff
                        WHERE provider_staff.provider_id = providers.id
                        AND provider_staff.user_id = auth.uid()
                    )
                )
            )
        )
    );

-- Superadmins can manage all payments
DROP POLICY IF EXISTS "Superadmins can manage all payments" ON booking_payments;
CREATE POLICY "Superadmins can manage all payments"
    ON booking_payments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Similar policies for refunds
DROP POLICY IF EXISTS "Customers can view own refunds" ON booking_refunds;
CREATE POLICY "Customers can view own refunds"
    ON booking_refunds FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_refunds.booking_id
            AND bookings.customer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can manage refunds" ON booking_refunds;
CREATE POLICY "Providers can manage refunds"
    ON booking_refunds FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_refunds.booking_id
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = bookings.provider_id
                AND (
                    providers.user_id = auth.uid() OR
                    EXISTS (
                        SELECT 1 FROM provider_staff
                        WHERE provider_staff.provider_id = providers.id
                        AND provider_staff.user_id = auth.uid()
                    )
                )
            )
        )
    );

DROP POLICY IF EXISTS "Superadmins can manage all refunds" ON booking_refunds;
CREATE POLICY "Superadmins can manage all refunds"
    ON booking_refunds FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Comments
COMMENT ON TABLE booking_payments IS 'Tracks all payments made for bookings';
COMMENT ON TABLE booking_refunds IS 'Tracks all refunds issued for bookings';
COMMENT ON COLUMN bookings.payment_status IS 'Current payment status: pending, paid, partially_paid, refunded, failed';
COMMENT ON COLUMN bookings.total_paid IS 'Total amount paid for this booking';
COMMENT ON COLUMN bookings.total_refunded IS 'Total amount refunded for this booking';
COMMENT ON FUNCTION update_booking_payment_status IS 'Automatically updates booking payment status based on payments and refunds';
