-- Allow package product lines to target a specific product variant.
ALTER TABLE service_package_items
  ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_package_items_product_variant
  ON service_package_items(product_variant_id)
  WHERE product_variant_id IS NOT NULL;

DROP INDEX IF EXISTS service_package_items_package_product_unique;

CREATE UNIQUE INDEX IF NOT EXISTS service_package_items_package_product_unique
  ON service_package_items(package_id, product_id)
  WHERE product_id IS NOT NULL AND product_variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_package_items_package_product_variant_unique
  ON service_package_items(package_id, product_id, product_variant_id)
  WHERE product_id IS NOT NULL AND product_variant_id IS NOT NULL;

COMMENT ON COLUMN service_package_items.product_variant_id IS
  'Optional product variant included in a package product line. Null means the base product/legacy product line.';
