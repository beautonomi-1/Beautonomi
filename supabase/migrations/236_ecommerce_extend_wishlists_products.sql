-- ============================================================================
-- Migration 236: Extend Wishlists + Products for E-commerce
-- ============================================================================
-- Allow products in wishlists and add customer-facing fields to products
-- ============================================================================

-- Extend wishlist item_type to include 'product'
ALTER TABLE wishlist_items DROP CONSTRAINT IF EXISTS wishlist_items_item_type_check;
ALTER TABLE wishlist_items ADD CONSTRAINT wishlist_items_item_type_check
  CHECK (item_type IN ('provider', 'offering', 'package', 'product'));

-- Add customer-facing fields to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS long_description TEXT,
  ADD COLUMN IF NOT EXISTS weight_grams INTEGER,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Unique slug per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_provider_slug
  ON products(provider_id, slug) WHERE slug IS NOT NULL;

-- GIN index for tag filtering
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN (tags);

-- Full-text search index on products
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);
