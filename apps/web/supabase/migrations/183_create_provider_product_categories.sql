-- Beautonomi Database Migration
-- 183_create_provider_product_categories.sql
-- Creates provider_product_categories table for provider-specific product categories

-- Create provider_product_categories table (similar to provider_categories but for products)
CREATE TABLE IF NOT EXISTS provider_product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, slug)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_provider_product_categories_provider ON provider_product_categories(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_product_categories_slug ON provider_product_categories(provider_id, slug);
CREATE INDEX IF NOT EXISTS idx_provider_product_categories_active ON provider_product_categories(provider_id, is_active) WHERE is_active = true;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_provider_product_categories_updated_at ON provider_product_categories;
CREATE TRIGGER update_provider_product_categories_updated_at 
    BEFORE UPDATE ON provider_product_categories
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE provider_product_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for provider_product_categories
DROP POLICY IF EXISTS "Providers can view their own product categories" ON provider_product_categories;
CREATE POLICY "Providers can view their own product categories"
    ON provider_product_categories FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can create their own product categories" ON provider_product_categories;
CREATE POLICY "Providers can create their own product categories"
    ON provider_product_categories FOR INSERT
    WITH CHECK (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can update their own product categories" ON provider_product_categories;
CREATE POLICY "Providers can update their own product categories"
    ON provider_product_categories FOR UPDATE
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can delete their own product categories" ON provider_product_categories;
CREATE POLICY "Providers can delete their own product categories"
    ON provider_product_categories FOR DELETE
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

-- Add comment
COMMENT ON TABLE provider_product_categories IS 'Provider-specific product categories. Separate from provider_categories which are for services.';
