-- Prevent bookings / POS / ecommerce from silently selling tracked products
-- below zero. Untracked products remain unlimited.

CREATE OR REPLACE FUNCTION decrement_product_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS void AS $$
DECLARE
  v_track_stock BOOLEAN;
  v_updated INTEGER;
BEGIN
  SELECT COALESCE(track_stock_quantity, TRUE)
    INTO v_track_stock
  FROM products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_track_stock IS FALSE THEN
    RETURN;
  END IF;

  UPDATE products
  SET quantity = quantity - p_quantity,
      updated_at = NOW()
  WHERE id = p_product_id
    AND quantity >= p_quantity;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Insufficient product stock' USING ERRCODE = 'P0001';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_product_variant_stock(p_variant_id UUID, p_quantity INTEGER)
RETURNS void AS $$
DECLARE
  v_track_stock BOOLEAN;
  v_updated INTEGER;
BEGIN
  SELECT COALESCE(p.track_stock_quantity, TRUE)
    INTO v_track_stock
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = p_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product variant not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_track_stock IS FALSE THEN
    RETURN;
  END IF;

  UPDATE product_variants
  SET quantity = quantity - p_quantity,
      updated_at = NOW()
  WHERE id = p_variant_id
    AND quantity >= p_quantity;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Insufficient product variant stock' USING ERRCODE = 'P0001';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
