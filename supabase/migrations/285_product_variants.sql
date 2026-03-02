-- ============================================================================
-- Migration 285: Product Variants
-- ============================================================================
-- Add support for product variants (e.g. size, volume) with per-variant
-- SKU, price, and stock. Existing products remain single-product (no variant rows).
-- ============================================================================

-- 1) Add has_variants and option_types to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS variant_option_types JSONB DEFAULT '[]';
-- variant_option_types: [{ "name": "Size", "values": ["250ml", "500ml"] }, ...]

COMMENT ON COLUMN products.has_variants IS 'When true, sellable items are product_variants; when false, product is sold as-is (legacy single product).';
COMMENT ON COLUMN products.variant_option_types IS 'Option type name and values for variant matrix, e.g. [{"name":"Size","values":["250ml","500ml"]}]';

-- 2) Create product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- Option values that identify this variant, e.g. {"Size": "250ml"}
  option_values JSONB NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,

  sku TEXT,
  barcode TEXT,
  measure TEXT,
  amount NUMERIC(10, 2),

  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_level INTEGER DEFAULT 5,
  reorder_quantity INTEGER DEFAULT 0,

  supply_price NUMERIC(10, 2) DEFAULT 0,
  retail_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  markup NUMERIC(5, 2),

  image_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(product_id, option_values)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;

CREATE OR REPLACE FUNCTION update_product_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON product_variants;
CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION update_product_variants_updated_at();

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- RLS: same as products (provider can manage own; public can view active retail products)
CREATE POLICY "Public can view variants of active products"
  ON product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN providers pr ON pr.id = p.provider_id
      WHERE p.id = product_variants.product_id
        AND p.is_active = true
        AND p.retail_sales_enabled = true
        AND pr.status = 'active'
    )
  );

CREATE POLICY "Providers can manage own product variants"
  ON product_variants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN providers pr ON pr.id = p.provider_id
      WHERE p.id = product_variants.product_id
        AND pr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      JOIN providers pr ON pr.id = p.provider_id
      WHERE p.id = product_variants.product_id
        AND pr.user_id = auth.uid()
    )
  );

-- 3) Add product_variant_id to booking_products (nullable for legacy)
ALTER TABLE booking_products
  ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_products_product_variant ON booking_products(product_variant_id) WHERE product_variant_id IS NOT NULL;

COMMENT ON COLUMN booking_products.product_variant_id IS 'When set, line item is for this variant; when null, legacy single product.';

-- 4) Add product_variant_id to product_order_items
ALTER TABLE product_order_items
  ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_order_items_variant ON product_order_items(product_variant_id) WHERE product_variant_id IS NOT NULL;

COMMENT ON COLUMN product_order_items.product_variant_id IS 'When set, line item is for this variant; when null, legacy single product.';

-- 5) Cart: allow same product with different variants (change unique to include variant)
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE;

-- Remove old unique constraint so one product can appear with multiple variants
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_user_id_product_id_key;
-- One row per (user, product) when no variant
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_user_product_no_variant
  ON cart_items(user_id, product_id) WHERE product_variant_id IS NULL;
-- One row per (user, product, variant) when variant set
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_user_product_variant
  ON cart_items(user_id, product_id, product_variant_id) WHERE product_variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cart_items_product_variant ON cart_items(product_variant_id) WHERE product_variant_id IS NOT NULL;

-- 6) Variant stock decrement/increment (for orders and cancellations)
CREATE OR REPLACE FUNCTION decrement_product_variant_stock(p_variant_id UUID, p_quantity INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE product_variants
  SET quantity = GREATEST(0, quantity - p_quantity),
      updated_at = NOW()
  WHERE id = p_variant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_product_variant_stock(p_variant_id UUID, p_quantity INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE product_variants
  SET quantity = quantity + p_quantity,
      updated_at = NOW()
  WHERE id = p_variant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
