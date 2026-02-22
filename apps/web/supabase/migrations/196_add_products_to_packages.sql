-- Beautonomi Database Migration
-- 196_add_products_to_packages.sql
-- Adds support for products in service packages

-- Add product_id column to service_package_items
ALTER TABLE service_package_items
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;

-- Add index for product_id
CREATE INDEX IF NOT EXISTS idx_service_package_items_product ON service_package_items(product_id);

-- Make offering_id nullable (since we can now have products instead)
ALTER TABLE service_package_items
ALTER COLUMN offering_id DROP NOT NULL;

-- Add constraint to ensure either offering_id or product_id is set (but not both)
ALTER TABLE service_package_items
DROP CONSTRAINT IF EXISTS check_offering_or_product;

ALTER TABLE service_package_items
ADD CONSTRAINT check_offering_or_product CHECK (
  (offering_id IS NOT NULL AND product_id IS NULL) OR
  (offering_id IS NULL AND product_id IS NOT NULL)
);

-- Update unique constraint to include product_id
ALTER TABLE service_package_items
DROP CONSTRAINT IF EXISTS service_package_items_package_id_offering_id_key;

-- Create unique constraints for both offering and product
CREATE UNIQUE INDEX IF NOT EXISTS service_package_items_package_offering_unique 
ON service_package_items(package_id, offering_id) 
WHERE offering_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_package_items_package_product_unique 
ON service_package_items(package_id, product_id) 
WHERE product_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN service_package_items.product_id IS 'Reference to a product in the package. Either offering_id or product_id must be set, but not both.';
