-- Gods Eye Live Map: provider location events, booking tracking state, audit log, config.
-- Privacy: superadmin-only read; provider ping ingestion with booking ownership checks.

-- 1) provider_location_events (operational tracking; can coexist with provider_location_updates)
CREATE TABLE IF NOT EXISTS provider_location_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('foreground', 'background', 'manual', 'system')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  heading_deg DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_lat CHECK (lat >= -90 AND lat <= 90),
  CONSTRAINT valid_lng CHECK (lng >= -180 AND lng <= 180)
);

CREATE INDEX idx_provider_location_events_provider_recorded
  ON provider_location_events(provider_id, recorded_at DESC);
CREATE INDEX idx_provider_location_events_booking_recorded
  ON provider_location_events(booking_id, recorded_at DESC) WHERE booking_id IS NOT NULL;

ALTER TABLE provider_location_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers insert own provider_location_events"
  ON provider_location_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = provider_location_events.provider_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM provider_staff ps
        WHERE ps.provider_id = p.id AND ps.user_id = auth.uid() AND ps.is_active = true
      ))
    )
  );

CREATE POLICY "Superadmins select provider_location_events"
  ON provider_location_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

CREATE POLICY "Providers select own provider_location_events"
  ON provider_location_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = provider_location_events.provider_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM provider_staff ps
        WHERE ps.provider_id = p.id AND ps.user_id = auth.uid() AND ps.is_active = true
      ))
    )
  );

COMMENT ON TABLE provider_location_events IS 'Gods Eye: provider location pings for live map and arrival detection. Retention policy applies.';

-- 2) booking_tracking_state (one row per booking; updated by ping API / triggers)
CREATE TABLE IF NOT EXISTS booking_tracking_state (
  booking_id UUID PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  tracking_enabled BOOLEAN NOT NULL DEFAULT false,
  provider_last_lat DOUBLE PRECISION,
  provider_last_lng DOUBLE PRECISION,
  provider_last_at TIMESTAMPTZ,
  customer_target_lat DOUBLE PRECISION,
  customer_target_lng DOUBLE PRECISION,
  arrived_at_target BOOLEAN DEFAULT false,
  arrived_at TIMESTAMPTZ,
  arrived_distance_m DOUBLE PRECISION,
  last_distance_to_target_m DOUBLE PRECISION,
  status TEXT CHECK (status IN ('en_route', 'arrived', 'in_service', 'completed')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_booking_tracking_state_updated ON booking_tracking_state(updated_at DESC);

ALTER TABLE booking_tracking_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins all booking_tracking_state"
  ON booking_tracking_state FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

CREATE POLICY "Providers select own booking_tracking_state"
  ON booking_tracking_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN providers p ON p.id = b.provider_id
      WHERE b.id = booking_tracking_state.booking_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM provider_staff ps
        WHERE ps.provider_id = p.id AND ps.user_id = auth.uid() AND ps.is_active = true
      ))
    )
  );

COMMENT ON TABLE booking_tracking_state IS 'Gods Eye: derived tracking state per booking for arrival evidence and live map.';

-- 3) gods_eye_audit_log
CREATE TABLE IF NOT EXISTS gods_eye_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('view_map', 'open_booking', 'export', 'toggle_filter')),
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gods_eye_audit_log_created ON gods_eye_audit_log(created_at DESC);
CREATE INDEX idx_gods_eye_audit_log_admin ON gods_eye_audit_log(admin_user_id, created_at DESC);

ALTER TABLE gods_eye_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins insert gods_eye_audit_log"
  ON gods_eye_audit_log FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
    AND admin_user_id = auth.uid()
  );

CREATE POLICY "Superadmins select gods_eye_audit_log"
  ON gods_eye_audit_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

COMMENT ON TABLE gods_eye_audit_log IS 'Gods Eye: audit trail for superadmin map views and booking tracking access.';

-- 4) gods_eye_tracking_config (superadmin-editable; single row or keyed)
CREATE TABLE IF NOT EXISTS gods_eye_tracking_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gods_eye_tracking_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage gods_eye_tracking_config"
  ON gods_eye_tracking_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

-- Default config row
INSERT INTO gods_eye_tracking_config (key, value)
VALUES ('default', '{
  "tracking_enabled_global": true,
  "tracking_ping_interval_seconds": 15,
  "tracking_arrival_radius_meters": 100,
  "retention_days_raw_pings": 30,
  "privacy_fuzz_meters_default": 200,
  "map_default_zoom": 10,
  "map_default_center": {"lng": 28.0473, "lat": -26.2041}
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE gods_eye_tracking_config IS 'Gods Eye: tracking and map defaults (arrival radius, retention, privacy fuzz).';
