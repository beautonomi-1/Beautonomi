-- ============================================================================
-- Migration 239: Product Return Requests
-- ============================================================================
-- Allows customers to request returns/refunds on product orders.
-- Providers review and approve/reject. Superadmin can intervene.
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_return_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES product_orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES product_order_items(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

    -- Request details
    reason TEXT NOT NULL CHECK (reason IN (
        'damaged', 'wrong_item', 'not_as_described', 'quality_issue',
        'changed_mind', 'arrived_late', 'other'
    )),
    description TEXT,
    image_urls TEXT[] DEFAULT '{}',

    -- Item details (snapshot for record-keeping)
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    refund_amount NUMERIC(10,2) NOT NULL CHECK (refund_amount >= 0),

    -- Status workflow
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',           -- awaiting provider review
        'approved',          -- provider approved, awaiting item return
        'item_received',     -- provider received returned item
        'refunded',          -- refund processed
        'rejected',          -- provider rejected
        'escalated',         -- escalated to superadmin
        'resolved_by_admin', -- superadmin resolved
        'cancelled'          -- customer cancelled request
    )),

    -- Resolution
    provider_notes TEXT,
    admin_notes TEXT,
    resolved_by UUID REFERENCES users(id),
    resolution TEXT CHECK (resolution IS NULL OR resolution IN (
        'full_refund', 'partial_refund', 'replacement', 'store_credit', 'denied'
    )),
    refund_processed_amount NUMERIC(10,2),
    refund_method TEXT,

    -- Return logistics
    return_method TEXT CHECK (return_method IS NULL OR return_method IN ('drop_off', 'courier', 'not_required')),
    return_tracking_number TEXT,

    -- Timestamps
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    item_received_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    escalated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_return_requests_order ON product_return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_customer ON product_return_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_provider ON product_return_requests(provider_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON product_return_requests(status);
CREATE INDEX IF NOT EXISTS idx_return_requests_created ON product_return_requests(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_return_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_return_requests_updated_at
  BEFORE UPDATE ON product_return_requests
  FOR EACH ROW EXECUTE FUNCTION update_return_requests_updated_at();

-- RLS
ALTER TABLE product_return_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own return requests"
  ON product_return_requests FOR SELECT
  USING (auth.uid() = customer_id);

CREATE POLICY "Customers can create return requests"
  ON product_return_requests FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update own pending requests"
  ON product_return_requests FOR UPDATE
  USING (auth.uid() = customer_id AND status = 'pending');

CREATE POLICY "Providers can view their return requests"
  ON product_return_requests FOR SELECT
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Providers can update return requests"
  ON product_return_requests FOR UPDATE
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Superadmin full access product_return_requests"
  ON product_return_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin'));

-- Notification templates for returns
INSERT INTO notification_templates (key, title, body, channels, email_subject, email_body, variables, url, description)
VALUES
  (
    'product_return_requested',
    'Return Request Received',
    'A return request for order {{order_number}} has been submitted by {{customer_name}}',
    ARRAY['push', 'email']::TEXT[],
    'Return Request - {{order_number}}',
    '<h2>Return Request</h2><p>Customer <strong>{{customer_name}}</strong> has requested a return for order <strong>{{order_number}}</strong>.</p><p>Reason: {{reason}}</p><p>Amount: R{{refund_amount}}</p><p><a href="{{dashboard_url}}">Review Request</a></p>',
    ARRAY['order_number', 'customer_name', 'reason', 'refund_amount', 'dashboard_url']::TEXT[],
    '/provider/ecommerce/returns',
    'Sent to provider when customer requests a return'
  ),
  (
    'product_return_approved',
    'Return Approved',
    'Your return request for order {{order_number}} has been approved',
    ARRAY['push', 'email']::TEXT[],
    'Return Approved - {{order_number}}',
    '<h2>Return Approved</h2><p>Your return request for order <strong>{{order_number}}</strong> has been approved.</p><p>{{return_instructions}}</p>',
    ARRAY['order_number', 'return_instructions']::TEXT[],
    '/product-orders',
    'Sent to customer when return is approved'
  ),
  (
    'product_return_rejected',
    'Return Request Update',
    'Your return request for order {{order_number}} could not be approved. Reason: {{reason}}',
    ARRAY['push', 'email']::TEXT[],
    'Return Request Update - {{order_number}}',
    '<h2>Return Request Update</h2><p>Unfortunately, your return request for order <strong>{{order_number}}</strong> could not be approved.</p><p>Reason: {{reason}}</p><p>If you believe this is incorrect, you can escalate to our support team.</p>',
    ARRAY['order_number', 'reason']::TEXT[],
    '/product-orders',
    'Sent to customer when return is rejected'
  ),
  (
    'product_return_refunded',
    'Refund Processed',
    'Your refund of R{{refund_amount}} for order {{order_number}} has been processed',
    ARRAY['push', 'email']::TEXT[],
    'Refund Processed - {{order_number}}',
    '<h2>Refund Processed</h2><p>Your refund of <strong>R{{refund_amount}}</strong> for order <strong>{{order_number}}</strong> has been processed.</p><p>Please allow 5-10 business days for the refund to reflect.</p>',
    ARRAY['order_number', 'refund_amount']::TEXT[],
    '/product-orders',
    'Sent to customer when refund is processed'
  )
ON CONFLICT (key) DO NOTHING;
