-- Mangomint-style online booking: Slot holds for deferred auth flow
CREATE TABLE IF NOT EXISTS booking_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES provider_staff(id) ON DELETE SET NULL,
  booking_services_snapshot JSONB NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'at_salon',
  location_id UUID REFERENCES provider_locations(id),
  address_snapshot JSONB,
  hold_status TEXT NOT NULL DEFAULT 'active' 
    CHECK (hold_status IN ('active','consumed','expired','cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by_user_id UUID REFERENCES users(id),
  guest_fingerprint_hash TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_booking_holds_provider_expires ON booking_holds(provider_id, expires_at) 
  WHERE hold_status = 'active';
CREATE INDEX idx_booking_holds_fingerprint ON booking_holds(guest_fingerprint_hash, created_at);
CREATE INDEX idx_booking_holds_created ON booking_holds(created_at);

ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can create holds" ON booking_holds FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can read hold by id" ON booking_holds FOR SELECT USING (true);
CREATE POLICY "Authenticated can update own hold" ON booking_holds FOR UPDATE
  USING (created_by_user_id = auth.uid() OR created_by_user_id IS NULL);
CREATE POLICY "Service role full access" ON booking_holds FOR ALL 
  USING (auth.role() = 'service_role');
