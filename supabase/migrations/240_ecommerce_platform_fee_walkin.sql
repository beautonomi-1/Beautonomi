-- ============================================================================
-- Migration 240: E-commerce Platform Fees & Walk-in Support
-- ============================================================================
-- Adds platform fee, order source (online vs walk-in), and payment method
-- details to product_orders. Online orders incur a platform fee; walk-in
-- sales (cash/yoco) do not.
-- ============================================================================

-- Add columns to product_orders
ALTER TABLE product_orders
  ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'online'
    CHECK (order_source IN ('online', 'walk_in')),
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;

COMMENT ON COLUMN product_orders.platform_fee IS 'Fee charged by platform on online orders (0 for walk-in)';
COMMENT ON COLUMN product_orders.order_source IS 'online = customer placed via app/web; walk_in = provider sold in-person';
COMMENT ON COLUMN product_orders.staff_id IS 'Staff who processed walk-in sale';
COMMENT ON COLUMN product_orders.customer_name IS 'Walk-in customer name (when no account)';
COMMENT ON COLUMN product_orders.customer_phone IS 'Walk-in customer phone (when no account)';

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_product_orders_source ON product_orders(order_source);
CREATE INDEX IF NOT EXISTS idx_product_orders_payment_method ON product_orders(payment_method);

-- Extend delivery fee config with more options
ALTER TABLE provider_shipping_config
  ADD COLUMN IF NOT EXISTS delivery_fee_type TEXT DEFAULT 'flat'
    CHECK (delivery_fee_type IN ('flat', 'weight_based', 'distance_based')),
  ADD COLUMN IF NOT EXISTS weight_rate_per_kg NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS distance_rate_per_km NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS collection_notes TEXT;

COMMENT ON COLUMN provider_shipping_config.delivery_fee_type IS 'How delivery fee is calculated';
