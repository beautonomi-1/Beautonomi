-- Beautonomi Database Migration
-- 123_add_service_fees.sql
-- Adds service/platform fee configuration and tracking

-- Create platform_fee_config table for system-wide fee configuration
CREATE TABLE IF NOT EXISTS platform_fee_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE, -- e.g., "default", "premium", "enterprise"
    description TEXT,
    fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage', 'fixed_amount', 'tiered')),
    fee_percentage NUMERIC(5, 2) DEFAULT 0 CHECK (fee_percentage >= 0 AND fee_percentage <= 100),
    fee_fixed_amount NUMERIC(10, 2) DEFAULT 0 CHECK (fee_fixed_amount >= 0),
    -- For tiered pricing
    tier_thresholds JSONB DEFAULT '[]'::jsonb, -- [{"max": 100, "percentage": 5}, {"max": 500, "percentage": 3}]
    min_booking_amount NUMERIC(10, 2) DEFAULT 0, -- Minimum booking value to apply fee
    max_fee_amount NUMERIC(10, 2), -- Optional cap on fee amount
    applies_to TEXT NOT NULL DEFAULT 'customer' CHECK (applies_to IN ('customer', 'provider', 'both')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add service fee fields to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS service_fee_config_id UUID REFERENCES platform_fee_config(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS service_fee_percentage NUMERIC(5, 2) DEFAULT 0 CHECK (service_fee_percentage >= 0 AND service_fee_percentage <= 100),
ADD COLUMN IF NOT EXISTS service_fee_amount NUMERIC(10, 2) DEFAULT 0 CHECK (service_fee_amount >= 0),
ADD COLUMN IF NOT EXISTS service_fee_paid_by TEXT DEFAULT 'customer' CHECK (service_fee_paid_by IN ('customer', 'provider'));

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_bookings_service_fee_config ON bookings(service_fee_config_id) WHERE service_fee_config_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_fee_config_active ON platform_fee_config(is_active) WHERE is_active = true;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_platform_fee_config_updated_at ON platform_fee_config;
CREATE TRIGGER update_platform_fee_config_updated_at 
    BEFORE UPDATE ON platform_fee_config
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on platform_fee_config
ALTER TABLE platform_fee_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Superadmins can manage platform fee configs" ON platform_fee_config;
CREATE POLICY "Superadmins can manage platform fee configs"
    ON platform_fee_config FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

DROP POLICY IF EXISTS "All authenticated users can view active platform fee configs" ON platform_fee_config;
CREATE POLICY "All authenticated users can view active platform fee configs"
    ON platform_fee_config FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND is_active = true
    );

-- Insert default platform fee configurations
INSERT INTO platform_fee_config (name, description, fee_type, fee_percentage, applies_to, is_active) VALUES
('customer_default', 'Default customer service fee (10%)', 'percentage', 10.00, 'customer', true),
('customer_premium', 'Premium customer service fee (7.5%)', 'percentage', 7.50, 'customer', true),
('customer_enterprise', 'Enterprise customer service fee (5%)', 'percentage', 5.00, 'customer', true),
('provider_default', 'Default provider commission (15%)', 'percentage', 15.00, 'provider', true),
('fixed_small', 'Fixed small booking fee', 'fixed_amount', 0, 'customer', true)
ON CONFLICT (name) DO UPDATE SET 
    description = EXCLUDED.description,
    fee_type = EXCLUDED.fee_type,
    fee_percentage = EXCLUDED.fee_percentage;

-- Update fixed_small to have actual amount
UPDATE platform_fee_config 
SET fee_fixed_amount = 25.00 
WHERE name = 'fixed_small';

-- Add service fee to providers table (which fee config applies to them)
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS customer_fee_config_id UUID REFERENCES platform_fee_config(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS provider_fee_config_id UUID REFERENCES platform_fee_config(id) ON DELETE SET NULL;

-- Set default fee configs for existing providers
UPDATE providers 
SET customer_fee_config_id = (
    SELECT id FROM platform_fee_config 
    WHERE name = 'customer_default' 
    LIMIT 1
)
WHERE customer_fee_config_id IS NULL;

-- Add comments
COMMENT ON TABLE platform_fee_config IS 'System-wide platform/service fee configuration';
COMMENT ON COLUMN platform_fee_config.fee_type IS 'Type of fee: percentage, fixed_amount, or tiered';
COMMENT ON COLUMN platform_fee_config.tier_thresholds IS 'For tiered pricing: array of {max: amount, percentage: rate} objects';
COMMENT ON COLUMN platform_fee_config.applies_to IS 'Who pays the fee: customer, provider, or both';
COMMENT ON COLUMN bookings.service_fee_amount IS 'Calculated service fee amount at time of booking';
COMMENT ON COLUMN bookings.service_fee_percentage IS 'Service fee percentage used at time of booking';
COMMENT ON COLUMN bookings.service_fee_paid_by IS 'Who paid the service fee for this booking';
COMMENT ON COLUMN providers.customer_fee_config_id IS 'Service fee configuration for customers booking with this provider';
COMMENT ON COLUMN providers.provider_fee_config_id IS 'Commission fee configuration for this provider (what they pay to platform)';
