-- Mangomint-style online booking: Provider settings for /book/[slug] flow
CREATE TABLE IF NOT EXISTS provider_online_booking_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL UNIQUE REFERENCES providers(id) ON DELETE CASCADE,
  require_auth_step TEXT DEFAULT 'checkout' 
    CHECK (require_auth_step IN ('checkout','before_time_selection')),
  staff_selection_mode TEXT DEFAULT 'client_chooses'
    CHECK (staff_selection_mode IN ('client_chooses','anyone_default','hidden_auto_assign')),
  min_notice_minutes INT DEFAULT 60,
  max_advance_days INT DEFAULT 90,
  allow_pay_in_person BOOLEAN DEFAULT false,
  deposit_required BOOLEAN DEFAULT false,
  deposit_amount NUMERIC(10,2),
  deposit_percent NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_provider_online_booking_settings_provider ON provider_online_booking_settings(provider_id);

ALTER TABLE provider_online_booking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can manage own settings" ON provider_online_booking_settings
  FOR ALL USING (
    provider_id IN (SELECT provider_id FROM provider_staff WHERE user_id = auth.uid())
    OR provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
  );
CREATE POLICY "Public can read active provider settings" ON provider_online_booking_settings
  FOR SELECT USING (
    provider_id IN (SELECT id FROM providers WHERE status = 'active')
  );
CREATE POLICY "Service role full access" ON provider_online_booking_settings FOR ALL 
  USING (auth.role() = 'service_role');

-- Seed defaults for providers with online_booking_enabled
INSERT INTO provider_online_booking_settings (provider_id)
SELECT id FROM providers 
WHERE online_booking_enabled = true
ON CONFLICT (provider_id) DO NOTHING;
