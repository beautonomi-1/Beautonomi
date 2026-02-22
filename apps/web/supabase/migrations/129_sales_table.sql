-- ============================================================================
-- Migration 129: Sales Table
-- ============================================================================
-- This migration creates the sales table for tracking provider sales
-- ============================================================================

-- Create sales table
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    location_id UUID REFERENCES provider_locations(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL,
    sale_number TEXT NOT NULL,
    ref_number TEXT NOT NULL,
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    tax_rate NUMERIC(5, 4) DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 1),
    tax_amount NUMERIC(10, 2) DEFAULT 0 CHECK (tax_amount >= 0),
    discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'paystack', 'yoco', 'gift_card', 'other')),
    payment_status TEXT NOT NULL DEFAULT 'completed' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_provider TEXT,
    payment_provider_id TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_sale_number UNIQUE (provider_id, sale_number)
);

-- Create sale_items table
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('service', 'product')),
    item_id UUID, -- References offerings.id or products.id
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sales_provider ON sales(provider_id);
CREATE INDEX IF NOT EXISTS idx_sales_location ON sales(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_staff ON sales(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_type ON sale_items(item_type);

-- Create updated_at trigger
DROP TRIGGER IF EXISTS update_sales_updated_at ON sales;
CREATE TRIGGER update_sales_updated_at 
    BEFORE UPDATE ON sales
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to generate sale number
CREATE OR REPLACE FUNCTION generate_sale_number(provider_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    last_number INTEGER;
    new_number TEXT;
BEGIN
    -- Get the last sale number for this provider
    SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '(\d+)$') AS INTEGER)), 0)
    INTO last_number
    FROM sales
    WHERE provider_id = provider_uuid;
    
    -- Generate new number
    new_number := 'SALE-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD((last_number + 1)::TEXT, 6, '0');
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create function to auto-generate sale_number and ref_number
CREATE OR REPLACE FUNCTION set_sale_numbers()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sale_number IS NULL OR NEW.sale_number = '' THEN
        NEW.sale_number := generate_sale_number(NEW.provider_id);
    END IF;
    
    IF NEW.ref_number IS NULL OR NEW.ref_number = '' THEN
        NEW.ref_number := NEW.sale_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate sale numbers
DROP TRIGGER IF EXISTS set_sale_numbers_trigger ON sales;
CREATE TRIGGER set_sale_numbers_trigger
    BEFORE INSERT ON sales
    FOR EACH ROW
    EXECUTE FUNCTION set_sale_numbers();

-- Enable RLS
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sales
CREATE POLICY "Providers can view their own sales"
    ON sales FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Providers can create their own sales"
    ON sales FOR INSERT
    WITH CHECK (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Providers can update their own sales"
    ON sales FOR UPDATE
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Providers can delete their own sales"
    ON sales FOR DELETE
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for sale_items
CREATE POLICY "Providers can view sale items for their sales"
    ON sale_items FOR SELECT
    USING (
        sale_id IN (
            SELECT id FROM sales WHERE provider_id IN (
                SELECT id FROM providers WHERE user_id = auth.uid()
                UNION
                SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Providers can create sale items for their sales"
    ON sale_items FOR INSERT
    WITH CHECK (
        sale_id IN (
            SELECT id FROM sales WHERE provider_id IN (
                SELECT id FROM providers WHERE user_id = auth.uid()
                UNION
                SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Providers can update sale items for their sales"
    ON sale_items FOR UPDATE
    USING (
        sale_id IN (
            SELECT id FROM sales WHERE provider_id IN (
                SELECT id FROM providers WHERE user_id = auth.uid()
                UNION
                SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Providers can delete sale items for their sales"
    ON sale_items FOR DELETE
    USING (
        sale_id IN (
            SELECT id FROM sales WHERE provider_id IN (
                SELECT id FROM providers WHERE user_id = auth.uid()
                UNION
                SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
            )
        )
    );
