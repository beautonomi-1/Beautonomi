-- Beautonomi Database Migration
-- 074_product_catalogue_and_service_updates.sql
-- Creates products table and updates offerings table for improved catalogue management

-- Create Products table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    barcode TEXT,
    brand TEXT,
    measure TEXT, -- e.g. ml, g, kg
    amount NUMERIC(10, 2),
    short_description TEXT,
    description TEXT,
    category TEXT, -- Can be linked to a category table if needed, but text for now based on UI
    supplier TEXT,
    sku TEXT,
    quantity INTEGER DEFAULT 0,
    low_stock_level INTEGER DEFAULT 5,
    reorder_quantity INTEGER DEFAULT 0,
    supply_price NUMERIC(10, 2) DEFAULT 0,
    retail_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    retail_sales_enabled BOOLEAN DEFAULT true,
    markup NUMERIC(5, 2), -- Percentage
    tax_rate NUMERIC(5, 2) DEFAULT 0, -- Percentage
    team_member_commission_enabled BOOLEAN DEFAULT false,
    track_stock_quantity BOOLEAN DEFAULT true,
    receive_low_stock_notifications BOOLEAN DEFAULT false,
    image_urls TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for products
CREATE INDEX IF NOT EXISTS idx_products_provider ON products(provider_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Update Offerings (Services) table with new fields
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS aftercare_description TEXT,
ADD COLUMN IF NOT EXISTS online_booking_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS team_member_commission_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS extra_time_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS extra_time_duration INTEGER DEFAULT 0, -- minutes
ADD COLUMN IF NOT EXISTS reminder_to_rebook_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_to_rebook_weeks INTEGER DEFAULT 4,
ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS pricing_name TEXT,
ADD COLUMN IF NOT EXISTS service_available_for TEXT DEFAULT 'everyone', -- everyone, women, men
ADD COLUMN IF NOT EXISTS included_services TEXT[] DEFAULT '{}', -- Array of service IDs or names
ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT 'fixed', -- fixed, from, free, varies
ADD COLUMN IF NOT EXISTS service_cost_percentage NUMERIC(5, 2) DEFAULT 0; -- Cost as % of sale price

-- Create trigger for products updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Public can view active products of active providers" ON products;
DROP POLICY IF EXISTS "Providers can manage own products" ON products;

-- RLS Policies for products
CREATE POLICY "Public can view active products of active providers"
    ON products FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = products.provider_id
            AND providers.status = 'active'
        )
    );

CREATE POLICY "Providers can manage own products"
    ON products FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = products.provider_id
            AND providers.user_id = auth.uid()
        )
    );
