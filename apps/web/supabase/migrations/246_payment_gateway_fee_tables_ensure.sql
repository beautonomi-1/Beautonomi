-- Ensure payment gateway fee management tables exist (if 093 was skipped or not applied).
-- Idempotent: safe to run even when tables already exist.

-- Payment gateway fee configurations
CREATE TABLE IF NOT EXISTS payment_gateway_fee_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_name TEXT NOT NULL,
    fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage', 'fixed', 'tiered')),
    fee_percentage NUMERIC(5, 4) DEFAULT 0,
    fee_fixed_amount NUMERIC(10, 2) DEFAULT 0,
    fee_tiered_config JSONB DEFAULT '{}'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_fee_configs_gateway ON payment_gateway_fee_configs(gateway_name);
CREATE INDEX IF NOT EXISTS idx_fee_configs_active ON payment_gateway_fee_configs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_fee_configs_effective ON payment_gateway_fee_configs(effective_from, effective_until);

-- Fee adjustments
CREATE TABLE IF NOT EXISTS payment_fee_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE CASCADE,
    finance_transaction_id UUID REFERENCES finance_transactions(id) ON DELETE CASCADE,
    original_fee_amount NUMERIC(10, 2) NOT NULL,
    adjusted_fee_amount NUMERIC(10, 2) NOT NULL,
    adjustment_reason TEXT NOT NULL,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('correction', 'waiver', 'increase', 'reconciliation')),
    notes TEXT,
    reconciled BOOLEAN NOT NULL DEFAULT false,
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_fee_adjustments_payment_tx ON payment_fee_adjustments(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_finance_tx ON payment_fee_adjustments(finance_transaction_id);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_reconciled ON payment_fee_adjustments(reconciled);
CREATE INDEX IF NOT EXISTS idx_fee_adjustments_created_at ON payment_fee_adjustments(created_at DESC);

-- Fee reconciliations
CREATE TABLE IF NOT EXISTS fee_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_date DATE NOT NULL,
    gateway_name TEXT NOT NULL,
    expected_fees NUMERIC(10, 2) NOT NULL,
    actual_fees NUMERIC(10, 2) NOT NULL,
    variance NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'disputed')),
    notes TEXT,
    statement_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    UNIQUE(reconciliation_date, gateway_name)
);

CREATE INDEX IF NOT EXISTS idx_reconciliations_date ON fee_reconciliations(reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliations_gateway ON fee_reconciliations(gateway_name);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON fee_reconciliations(status);

-- Trigger for updated_at (self-contained so no dependency on 012)
CREATE OR REPLACE FUNCTION payment_gateway_fee_configs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_fee_configs_updated_at ON payment_gateway_fee_configs;
CREATE TRIGGER update_fee_configs_updated_at
  BEFORE UPDATE ON payment_gateway_fee_configs
  FOR EACH ROW EXECUTE FUNCTION payment_gateway_fee_configs_set_updated_at();

-- RLS
ALTER TABLE payment_gateway_fee_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_fee_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can manage fee configs" ON payment_gateway_fee_configs;
CREATE POLICY "Superadmins can manage fee configs"
  ON payment_gateway_fee_configs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmins can manage fee adjustments" ON payment_fee_adjustments;
CREATE POLICY "Superadmins can manage fee adjustments"
  ON payment_fee_adjustments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmins can manage reconciliations" ON fee_reconciliations;
CREATE POLICY "Superadmins can manage reconciliations"
  ON fee_reconciliations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
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
    SELECT * INTO fee_config
    FROM payment_gateway_fee_configs
    WHERE gateway_name = gateway_name_param
      AND currency = currency_param
      AND is_active = true
      AND (effective_until IS NULL OR effective_until > NOW())
      AND effective_from <= NOW()
    ORDER BY effective_from DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    CASE fee_config.fee_type
        WHEN 'percentage' THEN
            calculated_fee := transaction_amount * fee_config.fee_percentage;
        WHEN 'fixed' THEN
            calculated_fee := fee_config.fee_fixed_amount;
        WHEN 'tiered' THEN
            calculated_fee := transaction_amount * fee_config.fee_percentage;
        ELSE
            calculated_fee := 0;
    END CASE;

    RETURN ROUND(calculated_fee, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
