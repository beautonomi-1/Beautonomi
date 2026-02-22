-- ============================================================================
-- Migration 237: Stock management functions for e-commerce
-- ============================================================================

CREATE OR REPLACE FUNCTION decrement_product_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE products
  SET quantity = GREATEST(0, quantity - p_quantity),
      updated_at = NOW()
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_product_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE products
  SET quantity = quantity + p_quantity,
      updated_at = NOW()
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sequence for order numbers (nextval wrapper for RPC)
CREATE OR REPLACE FUNCTION nextval(seq_name TEXT)
RETURNS BIGINT AS $$
BEGIN
  RETURN nextval(seq_name::regclass);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
