-- Beautonomi Database Migration
-- 010_platform.sql
-- Creates platform-wide tables

-- Platform settings table
CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Promotions table
CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    type promotion_type NOT NULL,
    value NUMERIC(10, 2) NOT NULL CHECK (value > 0),
    min_purchase_amount NUMERIC(10, 2),
    max_discount_amount NUMERIC(10, 2),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    applicable_categories UUID[] DEFAULT '{}',
    applicable_providers UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (valid_until > valid_from)
);

-- Promotion usage tracking
CREATE TABLE IF NOT EXISTS promotion_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    discount_amount NUMERIC(10, 2) NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(promotion_id, user_id, booking_id)
);

-- Loyalty points rules
CREATE TABLE IF NOT EXISTS loyalty_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    points_per_currency_unit NUMERIC(10, 2) NOT NULL DEFAULT 1, -- e.g., 1 point per 1 ZAR
    currency TEXT NOT NULL DEFAULT 'ZAR',
    redemption_rate NUMERIC(10, 2) NOT NULL DEFAULT 100, -- e.g., 100 points = 10 ZAR
    is_active BOOLEAN DEFAULT true,
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    effective_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Loyalty point transactions
CREATE TABLE IF NOT EXISTS loyalty_point_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earned', 'redeemed', 'expired', 'adjusted')),
    points INTEGER NOT NULL,
    description TEXT,
    reference_id UUID, -- Links to booking, promotion, etc.
    reference_type TEXT, -- 'booking', 'promotion', 'admin_adjustment', etc.
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    action_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_id UUID REFERENCES users(id) ON DELETE SET NULL,
    referral_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    reward_amount NUMERIC(10, 2) DEFAULT 0,
    reward_currency TEXT DEFAULT 'ZAR',
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_platform_settings_active ON platform_settings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, valid_from, valid_until) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_promotion_usage_promotion ON promotion_usage(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usage_user ON promotion_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rules_active ON loyalty_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user ON loyalty_point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_reference ON loyalty_point_transactions(reference_id, reference_type) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type ON loyalty_point_transactions(user_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id) WHERE referred_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);

-- Create triggers for updated_at
CREATE TRIGGER update_platform_settings_updated_at BEFORE UPDATE ON platform_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_promotions_updated_at BEFORE UPDATE ON promotions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loyalty_rules_updated_at BEFORE UPDATE ON loyalty_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate user loyalty points balance
CREATE OR REPLACE FUNCTION get_user_loyalty_balance(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    SELECT COALESCE(SUM(
        CASE 
            WHEN transaction_type IN ('earned', 'adjusted') THEN points
            WHEN transaction_type IN ('redeemed', 'expired') THEN -points
            ELSE 0
        END
    ), 0)
    INTO v_balance
    FROM loyalty_point_transactions
    WHERE user_id = p_user_id
    AND (expires_at IS NULL OR expires_at > NOW());
    
    RETURN GREATEST(v_balance, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Enable Row Level Security
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for platform_settings
CREATE POLICY "Public can view active platform settings"
    ON platform_settings FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage platform settings"
    ON platform_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for promotions
CREATE POLICY "Public can view active promotions"
    ON promotions FOR SELECT
    USING (
        is_active = true AND
        valid_from <= NOW() AND
        valid_until >= NOW() AND
        (usage_limit IS NULL OR usage_count < usage_limit)
    );

CREATE POLICY "Superadmins can manage all promotions"
    ON promotions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for promotion_usage
CREATE POLICY "Users can view own promotion usage"
    ON promotion_usage FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Superadmins can view all promotion usage"
    ON promotion_usage FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for loyalty_rules
CREATE POLICY "Public can view active loyalty rules"
    ON loyalty_rules FOR SELECT
    USING (is_active = true);

CREATE POLICY "Superadmins can manage loyalty rules"
    ON loyalty_rules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- RLS Policies for loyalty_point_transactions
CREATE POLICY "Users can view own loyalty transactions"
    ON loyalty_point_transactions FOR SELECT
    USING (user_id = auth.uid());

-- RLS Policies for notifications
CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    USING (user_id = auth.uid());

-- RLS Policies for referrals
CREATE POLICY "Users can view own referrals"
    ON referrals FOR SELECT
    USING (referrer_id = auth.uid() OR referred_id = auth.uid());

CREATE POLICY "Users can create referrals"
    ON referrals FOR INSERT
    WITH CHECK (referrer_id = auth.uid());
