-- ============================================================================
-- Migration 232: E-commerce Product Orders
-- ============================================================================
-- Standalone product order tables for customer-initiated purchases
-- (separate from POS-based sales table which is provider-initiated)
-- ============================================================================

-- Product orders: customer purchases outside of bookings
CREATE TABLE IF NOT EXISTS product_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN (
        'pending',
        'confirmed',
        'processing',
        'ready_for_collection',
        'shipped',
        'delivered',
        'cancelled',
        'refunded'
      )),
    fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('collection', 'delivery')),

    -- Delivery address (only for delivery orders)
    delivery_address_id UUID REFERENCES user_addresses(id) ON DELETE SET NULL,
    delivery_instructions TEXT,
    tracking_number TEXT,
    estimated_delivery_date DATE,

    -- Collection location (only for collection orders)
    collection_location_id UUID REFERENCES provider_locations(id) ON DELETE SET NULL,

    -- Financials
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    tax_amount NUMERIC(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
    delivery_fee NUMERIC(10,2) DEFAULT 0 CHECK (delivery_fee >= 0),
    discount_amount NUMERIC(10,2) DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'ZAR',

    -- Payment
    payment_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_method TEXT,
    payment_provider_id TEXT,

    -- Timestamps
    confirmed_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product order line items
CREATE TABLE IF NOT EXISTS product_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES product_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_image_url TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_orders_customer ON product_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_product_orders_provider ON product_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_product_orders_status ON product_orders(status);
CREATE INDEX IF NOT EXISTS idx_product_orders_created ON product_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_order_items_order ON product_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_product_order_items_product ON product_order_items(product_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_product_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_orders_updated_at
  BEFORE UPDATE ON product_orders
  FOR EACH ROW EXECUTE FUNCTION update_product_orders_updated_at();

-- Generate order number sequence
CREATE SEQUENCE IF NOT EXISTS product_order_number_seq START 10000;

-- RLS
ALTER TABLE product_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_order_items ENABLE ROW LEVEL SECURITY;

-- Customers can see their own orders
CREATE POLICY "Customers can view own orders"
  ON product_orders FOR SELECT
  USING (auth.uid() = customer_id);

-- Providers can see orders for their business
CREATE POLICY "Providers can view their orders"
  ON product_orders FOR SELECT
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Authenticated users can create orders
CREATE POLICY "Authenticated users can create orders"
  ON product_orders FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Providers can update order status
CREATE POLICY "Providers can update their orders"
  ON product_orders FOR UPDATE
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Order items: viewable by order participants
CREATE POLICY "Order items visible to order participants"
  ON product_order_items FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM product_orders
      WHERE customer_id = auth.uid()
         OR provider_id IN (
              SELECT id FROM providers WHERE user_id = auth.uid()
              UNION
              SELECT provider_id FROM provider_staff WHERE user_id = auth.uid() AND is_active = true
            )
    )
  );

CREATE POLICY "Order items insertable by customer"
  ON product_order_items FOR INSERT
  WITH CHECK (
    order_id IN (SELECT id FROM product_orders WHERE customer_id = auth.uid())
  );

-- Superadmin full access
CREATE POLICY "Superadmin full access product_orders"
  ON product_orders FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );

CREATE POLICY "Superadmin full access product_order_items"
  ON product_order_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
  );
