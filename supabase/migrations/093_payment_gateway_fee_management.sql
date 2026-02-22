-- Beautonomi Database Migration
-- 093_payment_gateway_fee_management.sql
-- Fee configuration and adjustment management for payment gateways

-- Payment gateway fee configurations
CREATE TABLE IF NOT EXISTS payment_gateway_fee_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_name TEXT NOT NULL, -- 'paystack', 'stripe', 'yoco', etc.
    fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage', 'fixed', 'tiered')), -- Type of fee calculation
    fee_percentage NUMERIC(5, 4) DEFAULT 0, -- Percentage fee (e.g., 0.015 for 1.5%)
    fee_fixed_amount NUMERIC(10, 2) DEFAULT 0, -- Fixed fee amount
    fee_tiered_config JSONB DEFAULT '{}'::jsonb, -- For tiered pricing structures
    currency TEXT NOT NULL DEFAULT 'ZAR',
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    UNIQUE(gateway_name, currency, effective_from)
);

-- Indexes for fee configs
CREATE INDEX IF NOT EXISTS idx_fee_configs_gateway ON payment_gateway_fee_configs(gateway_name);
CREATE INDEX IF NOT EXISTS idx_fee_configs_active ON payment_gateway_fee_configs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_fee_configs_effective ON payment_gateway_fee_configs(effective_from, effective_until);

-- Fee adjustments (manual overrides for specific transactions)
CREATE TABLE IF NOT EXISTS payment_fee_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE CASCADE,
    finance_transaction_id UUID REFERENCES finance_transactions(id) ON DELETE CASCADE,
    original_fee_amount NUMERIC(10, 2) NOT NULL, -- Original fee before adjustment
    adjusted_fee_amount NUMERIC(10, 2) NOT NULL, -- New fee amount after adjustment
    adjustment_reason TEXT NOT NULL, -- Reason for adjustment
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('correction', 'waiver', 'increase', 'reconciliation')),
    notes TEXT,
    reconciled BOOLEAN NOT NULL DEFAULT false, -- Whether this has been reconciled
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Indexes for fee adjustments
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_payment_tx ON payment_fee_adjustments(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_finance_tx ON payment_fee_adjustments(finance_transaction_id);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_reconciled ON payment_fee_adjustments(reconciled);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_created_at ON payment_fee_adjustments(created_at DESC);

-- Fee reconciliation records
CREATE TABLE IF NOT EXISTS fee_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_date DATE NOT NULL,
    gateway_name TEXT NOT NULL,
    expected_fees NUMERIC(10, 2) NOT NULL, -- Expected fees based on transactions
    actual_fees NUMERIC(10, 2) NOT NULL, -- Actual fees from gateway statement
    variance NUMERIC(10, 2) NOT NULL, -- Difference (actual - expected)
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'disputed')),
    notes TEXT,
    statement_reference TEXT, -- Reference to gateway statement
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    UNIQUE(reconciliation_date, gateway_name)
);

-- Indexes for reconciliations
CREATE INDEX IF NOT EXISTS idx_reconciliations_date ON fee_reconciliations(reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliations_gateway ON fee_reconciliations(gateway_name);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON fee_reconciliations(status);

-- Triggers to update updated_at
CREATE TRIGGER update_fee_configs_updated_at
    BEFORE UPDATE ON payment_gateway_fee_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for payment_gateway_fee_configs
ALTER TABLE payment_gateway_fee_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage fee configs"
    ON payment_gateway_fee_configs FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- RLS Policies for payment_fee_adjustments
ALTER TABLE payment_fee_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage fee adjustments"
    ON payment_fee_adjustments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- RLS Policies for fee_reconciliations
ALTER TABLE fee_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage reconciliations"
    ON fee_reconciliations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- Function to calculate expected fee based on config
CREATE OR REPLACE FUNCTION calculate_expected_fee(
    gateway_name_param TEXT,
    transaction_amount NUMERIC,
    currency_param TEXT DEFAULT 'ZAR'
)
RETURNS NUMERIC AS $$
DECLARE
    fee_config RECORD;
    calculated_fee NUMERIC := 0;
BEGIN
    -- Get the active fee config for this gateway and currency
    SELECT * INTO fee_config
    FROM payment_gateway_fee_configs
    WHERE gateway_name = gateway_name_param
      AND currency = currency_param
      AND is_active = true
      AND (effective_until IS NULL OR effective_until > NOW())
      AND effective_from <= NOW()
    ORDER BY effective_from DESC
    LIMIT 1;
    
    -- If no config found, return 0
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Calculate fee based on type
    CASE fee_config.fee_type
        WHEN 'percentage' THEN
            calculated_fee := transaction_amount * fee_config.fee_percentage;
        WHEN 'fixed' THEN
            calculated_fee := fee_config.fee_fixed_amount;
        WHEN 'tiered' THEN
            -- For tiered, you'd need to implement the logic based on tiered_config JSONB
            -- For now, default to percentage
            calculated_fee := transaction_amount * fee_config.fee_percentage;
        ELSE
            calculated_fee := 0;
    END CASE;
    
    RETURN ROUND(calculated_fee, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
