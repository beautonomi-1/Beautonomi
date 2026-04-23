-- Persist POS / booking product variant on each line so pending→completed flows
-- (e.g. Yoco) can decrement the correct inventory after payment.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_product_variant
  ON sale_items(product_variant_id)
  WHERE product_variant_id IS NOT NULL;
