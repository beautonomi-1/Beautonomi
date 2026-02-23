-- Sumsub: provider verification status (SDK-based, replaces manual ID uploads)
CREATE TABLE IF NOT EXISTS provider_verification_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'reset')),
  sumsub_applicant_id TEXT,
  last_reviewed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_verification_status_provider ON provider_verification_status(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_verification_status_sumsub ON provider_verification_status(sumsub_applicant_id) WHERE sumsub_applicant_id IS NOT NULL;

ALTER TABLE provider_verification_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can view own verification status"
  ON provider_verification_status FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM providers WHERE providers.id = provider_verification_status.provider_id AND providers.user_id = auth.uid())
  );

CREATE POLICY "Superadmins can manage provider_verification_status"
  ON provider_verification_status FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_provider_verification_status_updated_at
  BEFORE UPDATE ON provider_verification_status FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Safety module config (env-scoped): Aura panic / check-in / escalation
CREATE TABLE IF NOT EXISTS safety_module_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  enabled BOOLEAN NOT NULL DEFAULT false,
  check_in_enabled BOOLEAN NOT NULL DEFAULT true,
  escalation_enabled BOOLEAN NOT NULL DEFAULT true,
  ui_copy JSONB NOT NULL DEFAULT '{}'::jsonb,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment)
);

CREATE INDEX IF NOT EXISTS idx_safety_module_config_environment ON safety_module_config(environment);

ALTER TABLE safety_module_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage safety_module_config"
  ON safety_module_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_safety_module_config_updated_at
  BEFORE UPDATE ON safety_module_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Safety events: panic, check-in, escalation (Aura integration)
CREATE TABLE IF NOT EXISTS safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('panic', 'check_in', 'escalation')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'dispatched', 'resolved', 'failed')),
  aura_request_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_events_user_created ON safety_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_events_booking ON safety_events(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_events_type ON safety_events(event_type);

ALTER TABLE safety_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own safety_events"
  ON safety_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own safety_events"
  ON safety_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Superadmins can manage safety_events"
  ON safety_events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_safety_events_updated_at
  BEFORE UPDATE ON safety_events FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE provider_verification_status IS 'Sumsub SDK verification status per provider';
COMMENT ON TABLE safety_module_config IS 'Safety button (Aura) module: panic, check-in, escalation toggles and UI copy';
COMMENT ON TABLE safety_events IS 'Safety button events: panic, check-in, escalation for Aura integration';
