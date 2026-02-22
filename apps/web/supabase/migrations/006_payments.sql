-- Beautonomi Database Migration
-- 006_payments.sql
-- Creates payment-related tables

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    payment_number TEXT NOT NULL UNIQUE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    status payment_status NOT NULL DEFAULT 'pending',
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    payment_provider TEXT NOT NULL, -- 'yoco', 'stripe', 'wallet', etc.
    payment_provider_transaction_id TEXT,
    payment_provider_response JSONB DEFAULT '{}',
    description TEXT,
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    refunded_amount NUMERIC(10, 2) DEFAULT 0 CHECK (refunded_amount >= 0),
    refunded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payouts table (provider earnings)
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    payout_number TEXT NOT NULL UNIQUE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    status payout_status NOT NULL DEFAULT 'pending',
    payout_method TEXT NOT NULL, -- 'bank_transfer', 'mobile_money', etc.
    payout_account_details JSONB DEFAULT '{}',
    platform_fee_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee_amount >= 0),
    platform_fee_percentage NUMERIC(5, 2) NOT NULL DEFAULT 15,
    net_amount NUMERIC(10, 2) NOT NULL CHECK (net_amount > 0),
    payment_ids UUID[] DEFAULT '{}', -- Array of payment IDs included in this payout
    scheduled_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    payout_provider TEXT, -- External payout provider
    payout_provider_transaction_id TEXT,
    payout_provider_response JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment refunds
CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    refund_number TEXT NOT NULL UNIQUE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    refund_provider TEXT NOT NULL,
    refund_provider_transaction_id TEXT,
    refund_provider_response JSONB DEFAULT '{}',
    processed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Platform fees configuration
CREATE TABLE IF NOT EXISTS platform_fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fee_type TEXT NOT NULL UNIQUE, -- 'booking', 'subscription', etc.
    fee_percentage NUMERIC(5, 2) NOT NULL DEFAULT 15,
    fee_fixed_amount NUMERIC(10, 2) DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'ZAR',
    is_active BOOLEAN DEFAULT true,
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    effective_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_number ON payments(payment_number);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_provider_transaction ON payments(payment_provider, payment_provider_transaction_id) WHERE payment_provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payouts_provider ON payouts(provider_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_payout_number ON payouts(payout_number);
CREATE INDEX IF NOT EXISTS idx_payouts_scheduled_at ON payouts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payouts_created_at ON payouts(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON payment_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status ON payment_refunds(status);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_refund_number ON payment_refunds(refund_number);
CREATE INDEX IF NOT EXISTS idx_platform_fees_type ON platform_fees(fee_type);
CREATE INDEX IF NOT EXISTS idx_platform_fees_active ON platform_fees(is_active) WHERE is_active = true;

-- Create triggers for updated_at
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON payouts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_refunds_updated_at BEFORE UPDATE ON payment_refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_fees_updated_at BEFORE UPDATE ON platform_fees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_fees ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payments
CREATE POLICY "Users can view own payments"
    ON payments FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Providers can view payments for own bookings"
    ON payments FOR SELECT
    USING (
        booking_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = payments.booking_id
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = bookings.provider_id
                AND providers.user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Superadmins can view all payments"
    ON payments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for payouts
CREATE POLICY "Providers can view own payouts"
    ON payouts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = payouts.provider_id
            AND providers.user_id = auth.uid()
        )
    );

CREATE POLICY "Superadmins can manage all payouts"
    ON payouts FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for payment_refunds
CREATE POLICY "Users can view refunds for own payments"
    ON payment_refunds FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM payments
            WHERE payments.id = payment_refunds.payment_id
            AND payments.user_id = auth.uid()
        )
    );

CREATE POLICY "Superadmins can manage all refunds"
    ON payment_refunds FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for platform_fees
CREATE POLICY "Public can view active platform fees"
    ON platform_fees FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage platform fees"
    ON platform_fees FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
