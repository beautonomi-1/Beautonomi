-- Beautonomi Database Migration
-- 036_custom_orders.sql
-- Custom Orders (Fiverr-style): customers create requests, providers respond with offers.

-- Custom requests
CREATE TABLE IF NOT EXISTS custom_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_category_id UUID REFERENCES global_service_categories(id) ON DELETE SET NULL,
  location_type location_type NOT NULL DEFAULT 'at_salon',
  description TEXT NOT NULL,
  budget_min NUMERIC(10, 2),
  budget_max NUMERIC(10, 2),
  preferred_start_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER DEFAULT 60,
  status TEXT NOT NULL CHECK (status IN ('pending', 'offered', 'expired', 'fulfilled', 'cancelled')) DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (budget_min IS NULL OR budget_min >= 0),
  CHECK (budget_max IS NULL OR budget_max >= 0),
  CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_max >= budget_min),
  CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

CREATE INDEX IF NOT EXISTS idx_custom_requests_customer ON custom_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_requests_provider ON custom_requests(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_requests_status ON custom_requests(status);

CREATE TRIGGER update_custom_requests_updated_at BEFORE UPDATE ON custom_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Attachments (image URLs for now; can be extended to storage paths)
CREATE TABLE IF NOT EXISTS custom_request_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES custom_requests(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_request_attachments_request ON custom_request_attachments(request_id);

-- Offers
CREATE TABLE IF NOT EXISTS custom_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES custom_requests(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  expiration_at TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'payment_pending', 'paid')) DEFAULT 'pending',
  payment_reference TEXT,
  payment_url TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  offering_id UUID REFERENCES offerings(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(payment_reference)
);

CREATE INDEX IF NOT EXISTS idx_custom_offers_request ON custom_offers(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_offers_provider ON custom_offers(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_offers_status ON custom_offers(status);

CREATE TRIGGER update_custom_offers_updated_at BEFORE UPDATE ON custom_offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE custom_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_offers ENABLE ROW LEVEL SECURITY;

-- Customers can manage their own requests
CREATE POLICY "Customers can CRUD their custom requests"
  ON custom_requests FOR ALL
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- Providers/staff can view requests for their provider
CREATE POLICY "Providers can view custom requests for their provider"
  ON custom_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = custom_requests.provider_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
        )
      )
    )
  );

-- Customers can manage attachments for their requests
CREATE POLICY "Customers can CRUD attachments for their requests"
  ON custom_request_attachments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM custom_requests r
      WHERE r.id = custom_request_attachments.request_id
      AND r.customer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM custom_requests r
      WHERE r.id = custom_request_attachments.request_id
      AND r.customer_id = auth.uid()
    )
  );

-- Providers can view attachments for requests assigned to them
CREATE POLICY "Providers can view attachments for their requests"
  ON custom_request_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM custom_requests r
      JOIN providers p ON p.id = r.provider_id
      WHERE r.id = custom_request_attachments.request_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
        )
      )
    )
  );

-- Providers can manage offers for their provider
CREATE POLICY "Providers can CRUD offers for their provider"
  ON custom_offers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = custom_offers.provider_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = custom_offers.provider_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
        )
      )
    )
  );

-- Customers can view offers attached to their requests
CREATE POLICY "Customers can view offers for their requests"
  ON custom_offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM custom_requests r
      WHERE r.id = custom_offers.request_id
      AND r.customer_id = auth.uid()
    )
  );

