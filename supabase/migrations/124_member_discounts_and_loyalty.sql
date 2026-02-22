-- ============================================================================
-- Migration 124: Member Discounts & Loyalty Points System
-- ============================================================================
-- This migration adds:
-- 1. Member discount functionality to memberships
-- 2. Complete loyalty points earning and redemption system
-- 3. Customer membership tracking
-- 4. Membership benefits management
-- ============================================================================

-- PART 1: MEMBER DISCOUNTS
-- ============================================================================

-- Add discount fields to memberships table
ALTER TABLE memberships 
ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2) DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed_amount', 'tiered')),
ADD COLUMN IF NOT EXISTS discount_applies_to TEXT DEFAULT 'all_services' CHECK (discount_applies_to IN ('all_services', 'specific_categories', 'specific_services')),
ADD COLUMN IF NOT EXISTS discount_service_categories UUID[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS discount_excluded_services UUID[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS discount_cap_per_booking NUMERIC(10, 2) DEFAULT NULL;

-- Add member discount tracking to bookings
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS membership_discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (membership_discount_amount >= 0),
ADD COLUMN IF NOT EXISTS membership_discount_percentage NUMERIC(5, 2) DEFAULT 0;

-- Create membership_benefits table for detailed benefits
CREATE TABLE IF NOT EXISTS membership_benefits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    benefit_type TEXT NOT NULL CHECK (benefit_type IN ('discount', 'free_service', 'priority_booking', 'exclusive_access', 'free_cancellation', 'other')),
    benefit_name TEXT NOT NULL,
    benefit_description TEXT,
    benefit_value JSONB DEFAULT '{}',
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create customer_memberships table (tracks active subscriptions)
CREATE TABLE IF NOT EXISTS customer_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE RESTRICT,
    provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'paused')),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    auto_renew BOOLEAN DEFAULT true,
    payment_method_id TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for member discounts
CREATE INDEX IF NOT EXISTS idx_bookings_membership ON bookings(membership_id) WHERE membership_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_membership_benefits_membership ON membership_benefits(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_benefits_active ON membership_benefits(membership_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_customer_memberships_customer ON customer_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_status ON customer_memberships(status);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_active ON customer_memberships(customer_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_customer_memberships_provider ON customer_memberships(provider_id) WHERE provider_id IS NOT NULL;

-- Triggers
DROP TRIGGER IF EXISTS update_customer_memberships_updated_at ON customer_memberships;
CREATE TRIGGER update_customer_memberships_updated_at 
    BEFORE UPDATE ON customer_memberships
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for membership_benefits
ALTER TABLE membership_benefits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view membership benefits" ON membership_benefits;
CREATE POLICY "Customers can view membership benefits"
    ON membership_benefits FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM memberships
            WHERE memberships.id = membership_benefits.membership_id
            AND memberships.is_active = true
        )
    );

DROP POLICY IF EXISTS "Superadmins can manage membership benefits" ON membership_benefits;
CREATE POLICY "Superadmins can manage membership benefits"
    ON membership_benefits FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for customer_memberships
ALTER TABLE customer_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own memberships" ON customer_memberships;
CREATE POLICY "Customers can view own memberships"
    ON customer_memberships FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Providers can view customer memberships" ON customer_memberships;
CREATE POLICY "Providers can view customer memberships"
    ON customer_memberships FOR SELECT
    USING (
        provider_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = customer_memberships.provider_id
            AND (
                providers.user_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                )
            )
        )
    );

DROP POLICY IF EXISTS "Superadmins can manage customer memberships" ON customer_memberships;
CREATE POLICY "Superadmins can manage customer memberships"
    ON customer_memberships FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Update default memberships with discounts
UPDATE memberships SET 
    discount_percentage = CASE 
        WHEN name ILIKE '%basic%' THEN 0
        WHEN name ILIKE '%silver%' THEN 5
        WHEN name ILIKE '%gold%' THEN 10
        WHEN name ILIKE '%platinum%' THEN 15
        ELSE 0
    END,
    discount_type = 'percentage',
    discount_applies_to = 'all_services'
WHERE name IS NOT NULL;

-- PART 2: LOYALTY POINTS SYSTEM
-- ============================================================================

-- Create loyalty_points_ledger table (transaction log)
CREATE TABLE IF NOT EXISTS loyalty_points_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earned', 'redeemed', 'expired', 'adjusted', 'bonus')),
    points_amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create loyalty_points_balance view (current balance per customer)
CREATE OR REPLACE VIEW loyalty_points_balance AS
SELECT 
    customer_id,
    SUM(points_amount) as total_points,
    SUM(CASE WHEN transaction_type = 'earned' THEN points_amount ELSE 0 END) as total_earned,
    SUM(CASE WHEN transaction_type = 'redeemed' THEN ABS(points_amount) ELSE 0 END) as total_redeemed,
    MAX(created_at) as last_transaction_at
FROM loyalty_points_ledger
WHERE expires_at IS NULL OR expires_at > NOW()
GROUP BY customer_id;

-- Create loyalty_point_redemptions table
CREATE TABLE IF NOT EXISTS loyalty_point_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points_redeemed INTEGER NOT NULL CHECK (points_redeemed > 0),
    discount_amount NUMERIC(10, 2) NOT NULL CHECK (discount_amount > 0),
    conversion_rate NUMERIC(10, 4) NOT NULL,
    ledger_transaction_id UUID REFERENCES loyalty_points_ledger(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add loyalty points fields to bookings
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0 CHECK (loyalty_points_earned >= 0),
ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER DEFAULT 0 CHECK (loyalty_points_redeemed >= 0),
ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (loyalty_discount_amount >= 0);

-- Create loyalty_point_config table
CREATE TABLE IF NOT EXISTS loyalty_point_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    earning_rate NUMERIC(10, 4) NOT NULL DEFAULT 1.0,
    redemption_rate NUMERIC(10, 4) NOT NULL DEFAULT 10.0,
    min_redemption_points INTEGER DEFAULT 50,
    max_redemption_percentage NUMERIC(5, 2) DEFAULT 50.0,
    points_expiry_days INTEGER DEFAULT 365,
    bonus_multipliers JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for loyalty points
CREATE INDEX IF NOT EXISTS idx_loyalty_points_ledger_customer ON loyalty_points_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_ledger_booking ON loyalty_points_ledger(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loyalty_points_ledger_expires ON loyalty_points_ledger(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loyalty_points_ledger_type ON loyalty_points_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_loyalty_point_redemptions_booking ON loyalty_point_redemptions(booking_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_point_redemptions_customer ON loyalty_point_redemptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_loyalty_points ON bookings(loyalty_points_earned, loyalty_points_redeemed);

-- Triggers
DROP TRIGGER IF EXISTS update_loyalty_point_config_updated_at ON loyalty_point_config;
CREATE TRIGGER update_loyalty_point_config_updated_at 
    BEFORE UPDATE ON loyalty_point_config
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for loyalty_points_ledger
ALTER TABLE loyalty_points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own points" ON loyalty_points_ledger;
CREATE POLICY "Customers can view own points"
    ON loyalty_points_ledger FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Providers can view customer points" ON loyalty_points_ledger;
CREATE POLICY "Providers can view customer points"
    ON loyalty_points_ledger FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = loyalty_points_ledger.booking_id
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

DROP POLICY IF EXISTS "Superadmins can manage all points" ON loyalty_points_ledger;
CREATE POLICY "Superadmins can manage all points"
    ON loyalty_points_ledger FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for loyalty_point_redemptions
ALTER TABLE loyalty_point_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own redemptions" ON loyalty_point_redemptions;
CREATE POLICY "Customers can view own redemptions"
    ON loyalty_point_redemptions FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Providers can view redemptions" ON loyalty_point_redemptions;
CREATE POLICY "Providers can view redemptions"
    ON loyalty_point_redemptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = loyalty_point_redemptions.booking_id
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

-- RLS Policies for loyalty_point_config
ALTER TABLE loyalty_point_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view loyalty config" ON loyalty_point_config;
CREATE POLICY "Everyone can view loyalty config"
    ON loyalty_point_config FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "Superadmins can manage loyalty config" ON loyalty_point_config;
CREATE POLICY "Superadmins can manage loyalty config"
    ON loyalty_point_config FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Insert default loyalty point configuration
INSERT INTO loyalty_point_config (name, earning_rate, redemption_rate, min_redemption_points, max_redemption_percentage, points_expiry_days, bonus_multipliers) 
VALUES ('default', 1.0, 10.0, 50, 50.0, 365, '{"first_booking": 2, "birthday": 50, "referral": 100}')
ON CONFLICT (name) DO UPDATE SET 
    earning_rate = EXCLUDED.earning_rate,
    redemption_rate = EXCLUDED.redemption_rate,
    updated_at = NOW();

-- FUNCTIONS
-- ============================================================================

-- Function to calculate points earned
CREATE OR REPLACE FUNCTION calculate_loyalty_points_earned(
    booking_amount NUMERIC,
    is_first_booking BOOLEAN DEFAULT false,
    is_birthday BOOLEAN DEFAULT false
) RETURNS INTEGER AS $$
DECLARE
    config_record loyalty_point_config%ROWTYPE;
    base_points INTEGER;
    bonus_multiplier NUMERIC;
    total_points INTEGER;
BEGIN
    SELECT * INTO config_record FROM loyalty_point_config WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
    
    IF config_record IS NULL THEN
        RETURN 0;
    END IF;
    
    base_points := FLOOR(booking_amount * config_record.earning_rate);
    bonus_multiplier := 1.0;
    
    IF is_first_booking AND config_record.bonus_multipliers ? 'first_booking' THEN
        bonus_multiplier := (config_record.bonus_multipliers->>'first_booking')::NUMERIC;
    END IF;
    
    total_points := FLOOR(base_points * bonus_multiplier);
    
    IF is_birthday AND config_record.bonus_multipliers ? 'birthday' THEN
        total_points := total_points + (config_record.bonus_multipliers->>'birthday')::INTEGER;
    END IF;
    
    RETURN total_points;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get customer's available points
CREATE OR REPLACE FUNCTION get_customer_available_points(customer_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    available_points INTEGER;
BEGIN
    SELECT COALESCE(SUM(points_amount), 0)
    INTO available_points
    FROM loyalty_points_ledger
    WHERE customer_id = customer_uuid
    AND (expires_at IS NULL OR expires_at > NOW());
    
    RETURN GREATEST(available_points, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate discount from points
CREATE OR REPLACE FUNCTION calculate_discount_from_points(
    points_to_redeem INTEGER
) RETURNS NUMERIC AS $$
DECLARE
    config_record loyalty_point_config%ROWTYPE;
    discount_amount NUMERIC;
BEGIN
    SELECT * INTO config_record FROM loyalty_point_config WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
    
    IF config_record IS NULL OR points_to_redeem < config_record.min_redemption_points THEN
        RETURN 0;
    END IF;
    
    discount_amount := points_to_redeem / config_record.redemption_rate;
    
    RETURN ROUND(discount_amount, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- COMMENTS
-- ============================================================================

COMMENT ON TABLE membership_benefits IS 'Detailed benefits associated with each membership tier';
COMMENT ON TABLE customer_memberships IS 'Tracks customer subscription to membership plans';
COMMENT ON TABLE loyalty_points_ledger IS 'Transaction log for all loyalty point activities';
COMMENT ON TABLE loyalty_point_redemptions IS 'Tracks loyalty points redeemed against bookings';
COMMENT ON TABLE loyalty_point_config IS 'System-wide loyalty points configuration';
COMMENT ON VIEW loyalty_points_balance IS 'Current points balance per customer';

COMMENT ON COLUMN memberships.discount_percentage IS 'Automatic discount percentage for members (e.g., 10 for 10%)';
COMMENT ON COLUMN bookings.membership_discount_amount IS 'Discount amount applied due to membership';
COMMENT ON COLUMN bookings.loyalty_points_earned IS 'Points earned from this booking';
COMMENT ON COLUMN bookings.loyalty_points_redeemed IS 'Points redeemed for discount on this booking';

COMMENT ON FUNCTION calculate_loyalty_points_earned IS 'Calculates points earned for a booking amount with bonuses';
COMMENT ON FUNCTION get_customer_available_points IS 'Returns customer''s current available (unexpired) points';
COMMENT ON FUNCTION calculate_discount_from_points IS 'Converts points to discount amount based on redemption rate';
