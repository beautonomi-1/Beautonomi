-- ============================================================================
-- Migration 219: Tiered Commission and Per-Service Overrides
-- ============================================================================

-- 1. Create provider_staff_commission_tiers for tiered (Boulevard-style) commission
CREATE TABLE IF NOT EXISTS provider_staff_commission_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES provider_staff(id) ON DELETE CASCADE,
    min_revenue NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_revenue >= 0),
    commission_rate NUMERIC(5, 2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
    tier_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_tiers_staff ON provider_staff_commission_tiers(staff_id);

-- RLS
ALTER TABLE provider_staff_commission_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can view commission tiers for their staff" ON provider_staff_commission_tiers;
CREATE POLICY "Providers can view commission tiers for their staff"
    ON provider_staff_commission_tiers FOR SELECT
    USING (
        staff_id IN (
            SELECT id FROM provider_staff
            WHERE provider_id IN (
                SELECT id FROM providers WHERE user_id = auth.uid()
                UNION
                SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Provider owners can manage commission tiers" ON provider_staff_commission_tiers;
CREATE POLICY "Provider owners can manage commission tiers"
    ON provider_staff_commission_tiers FOR ALL
    USING (
        staff_id IN (
            SELECT id FROM provider_staff
            WHERE provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
        )
    );

-- 2. Add commission_rate_override to offerings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'offerings' AND column_name = 'commission_rate_override') THEN
        ALTER TABLE offerings ADD COLUMN commission_rate_override NUMERIC(5, 2);
    END IF;
END $$;

-- 3. Add commission_rate_override to products
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'commission_rate_override') THEN
        ALTER TABLE products ADD COLUMN commission_rate_override NUMERIC(5, 2);
    END IF;
END $$;

COMMENT ON TABLE provider_staff_commission_tiers IS 'Tiered commission: when staff revenue in period reaches min_revenue, this rate applies to all revenue (Boulevard-style)';
COMMENT ON COLUMN offerings.commission_rate_override IS 'Override staff commission rate for this service when set';
COMMENT ON COLUMN products.commission_rate_override IS 'Override staff commission rate for this product when set';
