-- Beautonomi Database Migration
-- 154_provider_invoices_and_payment_methods.sql
-- Creates tables for provider invoices and payment methods

-- ============================================================================
-- PROVIDER PAYMENT METHODS
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('credit_card', 'debit_card', 'bank_account', 'paypal', 'other')),
    name TEXT NOT NULL, -- e.g., "Visa ending in 1234", "Standard Bank Account"
    last4 TEXT, -- Last 4 digits of card/account
    expiry_month INTEGER CHECK (expiry_month >= 1 AND expiry_month <= 12),
    expiry_year INTEGER CHECK (expiry_year >= 2020),
    bank_name TEXT,
    account_type TEXT CHECK (account_type IN ('checking', 'savings', 'other')),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional payment method details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for payment methods
CREATE INDEX IF NOT EXISTS idx_provider_payment_methods_provider ON provider_payment_methods(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_payment_methods_active ON provider_payment_methods(provider_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_provider_payment_methods_default ON provider_payment_methods(provider_id, is_default) WHERE is_default = true;

-- Unique constraint: only one default payment method per provider
CREATE UNIQUE INDEX IF NOT EXISTS unique_default_per_provider 
    ON provider_payment_methods(provider_id) 
    WHERE is_default = true;

-- ============================================================================
-- PROVIDER INVOICES
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL UNIQUE, -- e.g., "INV-2024-001"
    invoice_type TEXT NOT NULL CHECK (invoice_type IN ('platform_fee', 'commission', 'subscription', 'transaction_fee', 'other')),
    period_start DATE NOT NULL, -- Start of billing period
    period_end DATE NOT NULL, -- End of billing period
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    
    -- Financial details
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    tax_rate NUMERIC(5, 2) DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
    tax_amount NUMERIC(10, 2) DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    amount_paid NUMERIC(10, 2) DEFAULT 0 CHECK (amount_paid >= 0),
    amount_due NUMERIC(10, 2) GENERATED ALWAYS AS (total_amount - COALESCE(amount_paid, 0)) STORED,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled', 'refunded')),
    
    -- Payment details
    payment_method_id UUID REFERENCES provider_payment_methods(id) ON DELETE SET NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    payment_reference TEXT,
    
    -- Metadata
    description TEXT,
    line_items JSONB DEFAULT '[]'::jsonb, -- Array of invoice line items
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    viewed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_provider_invoices_provider ON provider_invoices(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_invoices_status ON provider_invoices(status);
CREATE INDEX IF NOT EXISTS idx_provider_invoices_period ON provider_invoices(provider_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_provider_invoices_due_date ON provider_invoices(due_date) WHERE status IN ('sent', 'partially_paid', 'overdue');
CREATE INDEX IF NOT EXISTS idx_provider_invoices_invoice_number ON provider_invoices(invoice_number);

-- ============================================================================
-- INVOICE LINE ITEMS (for tracking individual charges)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_invoice_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES provider_invoices(id) ON DELETE CASCADE,
    line_item_type TEXT NOT NULL CHECK (line_item_type IN ('platform_fee', 'commission', 'subscription', 'transaction_fee', 'adjustment', 'other')),
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) DEFAULT 1 CHECK (quantity >= 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
    
    -- Reference to source (e.g., booking_id for commission fees)
    reference_type TEXT, -- e.g., 'booking', 'subscription', 'transaction'
    reference_id UUID, -- ID of the referenced entity
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for line items
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON provider_invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_reference ON provider_invoice_line_items(reference_type, reference_id) WHERE reference_id IS NOT NULL;

-- ============================================================================
-- INVOICE PAYMENTS (tracking payments made against invoices)
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_invoice_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES provider_invoices(id) ON DELETE CASCADE,
    payment_method_id UUID REFERENCES provider_payment_methods(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_reference TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
    failure_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for invoice payments
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON provider_invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_status ON provider_invoice_payments(status);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE TRIGGER update_provider_payment_methods_updated_at
    BEFORE UPDATE ON provider_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_invoices_updated_at
    BEFORE UPDATE ON provider_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_invoice_payments_updated_at
    BEFORE UPDATE ON provider_invoice_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update invoice amount_paid when payments are added/updated
CREATE OR REPLACE FUNCTION update_invoice_amount_paid()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE provider_invoices
    SET amount_paid = (
        SELECT COALESCE(SUM(amount), 0)
        FROM provider_invoice_payments
        WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
        AND status = 'completed'
    ),
    status = CASE
        WHEN total_amount <= (
            SELECT COALESCE(SUM(amount), 0)
            FROM provider_invoice_payments
            WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
            AND status = 'completed'
        ) THEN 'paid'
        WHEN (
            SELECT COALESCE(SUM(amount), 0)
            FROM provider_invoice_payments
            WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
            AND status = 'completed'
        ) > 0 THEN 'partially_paid'
        WHEN due_date < CURRENT_DATE AND status = 'sent' THEN 'overdue'
        ELSE status
    END
    WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_on_payment_change
    AFTER INSERT OR UPDATE OR DELETE ON provider_invoice_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_amount_paid();

-- Function to ensure only one default payment method per provider
CREATE OR REPLACE FUNCTION ensure_single_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE provider_payment_methods
        SET is_default = false
        WHERE provider_id = NEW.provider_id
        AND id != NEW.id
        AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_default_payment_method_trigger
    BEFORE INSERT OR UPDATE ON provider_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_payment_method();

-- Note: Invoice numbers are generated in application code to ensure uniqueness

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE provider_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_invoice_payments ENABLE ROW LEVEL SECURITY;

-- Payment Methods Policies
DROP POLICY IF EXISTS "Providers can view their own payment methods" ON provider_payment_methods;
CREATE POLICY "Providers can view their own payment methods"
    ON provider_payment_methods FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_payment_methods.provider_id
            AND (
                providers.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                    AND provider_staff.is_active = true
                )
            )
        )
    );

DROP POLICY IF EXISTS "Providers can manage their own payment methods" ON provider_payment_methods;
CREATE POLICY "Providers can manage their own payment methods"
    ON provider_payment_methods FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_payment_methods.provider_id
            AND (
                providers.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                    AND provider_staff.is_active = true
                    AND provider_staff.role IN ('provider_owner', 'provider_manager')
                )
            )
        )
    );

DROP POLICY IF EXISTS "Superadmins can manage all payment methods" ON provider_payment_methods;
CREATE POLICY "Superadmins can manage all payment methods"
    ON provider_payment_methods FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Invoices Policies
DROP POLICY IF EXISTS "Providers can view their own invoices" ON provider_invoices;
CREATE POLICY "Providers can view their own invoices"
    ON provider_invoices FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_invoices.provider_id
            AND (
                providers.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM provider_staff
                    WHERE provider_staff.provider_id = providers.id
                    AND provider_staff.user_id = auth.uid()
                    AND provider_staff.is_active = true
                )
            )
        )
    );

DROP POLICY IF EXISTS "Superadmins can manage all invoices" ON provider_invoices;
CREATE POLICY "Superadmins can manage all invoices"
    ON provider_invoices FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Line Items Policies (inherit from invoice)
DROP POLICY IF EXISTS "Users can view line items for accessible invoices" ON provider_invoice_line_items;
CREATE POLICY "Users can view line items for accessible invoices"
    ON provider_invoice_line_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM provider_invoices
            WHERE provider_invoices.id = provider_invoice_line_items.invoice_id
        )
    );

DROP POLICY IF EXISTS "Superadmins can manage all line items" ON provider_invoice_line_items;
CREATE POLICY "Superadmins can manage all line items"
    ON provider_invoice_line_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Invoice Payments Policies
DROP POLICY IF EXISTS "Users can view payments for accessible invoices" ON provider_invoice_payments;
CREATE POLICY "Users can view payments for accessible invoices"
    ON provider_invoice_payments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM provider_invoices
            WHERE provider_invoices.id = provider_invoice_payments.invoice_id
        )
    );

DROP POLICY IF EXISTS "Superadmins can manage all invoice payments" ON provider_invoice_payments;
CREATE POLICY "Superadmins can manage all invoice payments"
    ON provider_invoice_payments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE provider_payment_methods IS 'Payment methods (cards, bank accounts) for providers to pay platform fees';
COMMENT ON TABLE provider_invoices IS 'Invoices sent to providers for platform fees, commissions, and subscriptions';
COMMENT ON TABLE provider_invoice_line_items IS 'Individual line items on provider invoices';
COMMENT ON TABLE provider_invoice_payments IS 'Payments made against provider invoices';
COMMENT ON COLUMN provider_invoices.invoice_type IS 'Type of invoice: platform_fee, commission, subscription, transaction_fee, other';
COMMENT ON COLUMN provider_invoices.status IS 'Invoice status: draft, sent, paid, partially_paid, overdue, cancelled, refunded';
COMMENT ON COLUMN provider_invoices.amount_due IS 'Calculated field: total_amount - amount_paid';
