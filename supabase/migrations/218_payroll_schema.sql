-- ============================================================================
-- Migration 218: Payroll Schema
-- ============================================================================
-- Adds provider_staff commission columns, pay_runs, pay_run_items,
-- staff_id on booking_products for commission attribution
-- ============================================================================

-- 1. Extend provider_staff with service/product commission rates
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'service_commission_rate') THEN
        ALTER TABLE provider_staff ADD COLUMN service_commission_rate NUMERIC(5, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_staff' AND column_name = 'product_commission_rate') THEN
        ALTER TABLE provider_staff ADD COLUMN product_commission_rate NUMERIC(5, 2) DEFAULT 0;
    END IF;
END $$;

COMMENT ON COLUMN provider_staff.service_commission_rate IS 'Commission percentage on service sales (0-100)';
COMMENT ON COLUMN provider_staff.product_commission_rate IS 'Commission percentage on product sales (0-100)';

-- 2. Add staff_id to booking_products for product commission attribution
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_products' AND column_name = 'staff_id') THEN
        ALTER TABLE booking_products ADD COLUMN staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_booking_products_staff ON booking_products(staff_id) WHERE staff_id IS NOT NULL;

COMMENT ON COLUMN booking_products.staff_id IS 'Staff member who sold this product (for commission). When null, infer from primary booking service.';

-- 3. Backfill staff_id on booking_products from first booking_services.staff_id
UPDATE booking_products bp
SET staff_id = (
    SELECT bs.staff_id
    FROM booking_services bs
    WHERE bs.booking_id = bp.booking_id
    AND bs.staff_id IS NOT NULL
    ORDER BY bs.created_at ASC
    LIMIT 1
)
WHERE bp.staff_id IS NULL;

-- 4. Create provider_pay_runs table
CREATE TABLE IF NOT EXISTS provider_pay_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_pay_runs_provider ON provider_pay_runs(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_pay_runs_status ON provider_pay_runs(status);
CREATE INDEX IF NOT EXISTS idx_provider_pay_runs_period ON provider_pay_runs(pay_period_start, pay_period_end);

-- 5. Create provider_pay_run_items table
CREATE TABLE IF NOT EXISTS provider_pay_run_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pay_run_id UUID NOT NULL REFERENCES provider_pay_runs(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES provider_staff(id) ON DELETE CASCADE,
    gross_pay NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (gross_pay >= 0),
    commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
    hourly_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (hourly_amount >= 0),
    salary_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (salary_amount >= 0),
    tips_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tips_amount >= 0),
    manual_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (manual_deductions >= 0),
    tax_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_deduction >= 0),
    uif_contribution NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (uif_contribution >= 0),
    taxable_income NUMERIC(12, 2),
    net_pay NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pay_run_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_pay_run_items_pay_run ON provider_pay_run_items(pay_run_id);
CREATE INDEX IF NOT EXISTS idx_pay_run_items_staff ON provider_pay_run_items(staff_id);

-- Updated_at trigger for pay runs
DROP TRIGGER IF EXISTS update_provider_pay_runs_updated_at ON provider_pay_runs;
CREATE TRIGGER update_provider_pay_runs_updated_at
    BEFORE UPDATE ON provider_pay_runs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_provider_pay_run_items_updated_at ON provider_pay_run_items;
CREATE TRIGGER update_provider_pay_run_items_updated_at
    BEFORE UPDATE ON provider_pay_run_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS for provider_pay_runs
ALTER TABLE provider_pay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_pay_run_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can view own pay runs" ON provider_pay_runs;
CREATE POLICY "Providers can view own pay runs"
    ON provider_pay_runs FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Provider owners can manage pay runs" ON provider_pay_runs;
CREATE POLICY "Provider owners can manage pay runs"
    ON provider_pay_runs FOR ALL
    USING (
        provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Providers can view own pay run items" ON provider_pay_run_items;
CREATE POLICY "Providers can view own pay run items"
    ON provider_pay_run_items FOR SELECT
    USING (
        pay_run_id IN (
            SELECT id FROM provider_pay_runs
            WHERE provider_id IN (
                SELECT id FROM providers WHERE user_id = auth.uid()
                UNION
                SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Provider owners can manage pay run items" ON provider_pay_run_items;
CREATE POLICY "Provider owners can manage pay run items"
    ON provider_pay_run_items FOR ALL
    USING (
        pay_run_id IN (
            SELECT id FROM provider_pay_runs
            WHERE provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
        )
    );

-- Staff can view their own pay run items
DROP POLICY IF EXISTS "Staff can view own pay run items" ON provider_pay_run_items;
CREATE POLICY "Staff can view own pay run items"
    ON provider_pay_run_items FOR SELECT
    USING (
        staff_id IN (
            SELECT id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

COMMENT ON TABLE provider_pay_runs IS 'Pay run periods for provider payroll';
COMMENT ON TABLE provider_pay_run_items IS 'Individual staff pay items within a pay run';
