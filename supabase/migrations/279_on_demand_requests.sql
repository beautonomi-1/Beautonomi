-- On-demand accept/decline: requests requiring provider acceptance before booking exists.
-- Realtime enabled so customer and provider get live status updates.

CREATE TABLE IF NOT EXISTS public.on_demand_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'accepted', 'declined', 'cancelled', 'expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_response_payload JSONB DEFAULT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_on_demand_requests_provider_status_expires
  ON public.on_demand_requests (provider_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_on_demand_requests_customer_status_requested
  ON public.on_demand_requests (customer_id, status, requested_at DESC);

CREATE TRIGGER update_on_demand_requests_updated_at
  BEFORE UPDATE ON public.on_demand_requests FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.on_demand_requests ENABLE ROW LEVEL SECURITY;

-- Customer: own rows only
CREATE POLICY "Customers can select own on_demand_requests"
  ON public.on_demand_requests FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY "Customers can insert own on_demand_requests"
  ON public.on_demand_requests FOR INSERT
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customers can update own requested row for cancel"
  ON public.on_demand_requests FOR UPDATE
  USING (
    customer_id = auth.uid()
    AND status = 'requested'
    AND (expires_at IS NULL OR expires_at > NOW())
  )
  WITH CHECK (customer_id = auth.uid());

-- Provider (owner or staff): rows for their provider
CREATE POLICY "Providers can select own provider on_demand_requests"
  ON public.on_demand_requests FOR SELECT
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Providers can update own provider requested row for accept/decline"
  ON public.on_demand_requests FOR UPDATE
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid() AND is_active = true
    )
    AND status = 'requested'
    AND (expires_at IS NULL OR expires_at > NOW())
  )
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Superadmin: full access
CREATE POLICY "Superadmins can manage all on_demand_requests"
  ON public.on_demand_requests FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

-- Enable realtime (Supabase: add table to realtime publication)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.on_demand_requests;
  END IF;
END $$;
