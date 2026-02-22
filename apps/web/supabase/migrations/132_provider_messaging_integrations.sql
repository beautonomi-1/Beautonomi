-- Migration: Provider Marketing Integrations
-- 132_provider_messaging_integrations.sql
-- Allows providers to configure their own email, SMS, and WhatsApp integrations
-- for running effective marketing campaigns
-- Similar structure to provider_yoco_integrations

-- Email Marketing Integration (SendGrid or Mailchimp)
CREATE TABLE IF NOT EXISTS provider_email_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE UNIQUE,
  provider_name VARCHAR(20) NOT NULL CHECK (provider_name IN ('sendgrid', 'mailchimp')),
  api_key TEXT, -- API key (encrypted in production)
  api_secret TEXT, -- For Mailchimp, this is the API key; for SendGrid, not needed
  from_email TEXT, -- Default from email address
  from_name TEXT DEFAULT 'Beautonomi', -- Default from name
  is_enabled BOOLEAN DEFAULT false,
  test_status VARCHAR(20) DEFAULT 'pending' CHECK (test_status IN ('pending', 'success', 'failed')),
  test_error TEXT,
  last_tested_at TIMESTAMPTZ,
  connected_date TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SMS & WhatsApp Marketing Integration (Twilio)
CREATE TABLE IF NOT EXISTS provider_twilio_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE UNIQUE,
  account_sid TEXT, -- Twilio Account SID
  auth_token TEXT, -- Twilio Auth Token (encrypted in production)
  sms_from_number TEXT, -- Phone number for SMS (e.g., +1234567890)
  whatsapp_from_number TEXT, -- WhatsApp number (e.g., whatsapp:+1234567890)
  is_sms_enabled BOOLEAN DEFAULT false,
  is_whatsapp_enabled BOOLEAN DEFAULT false,
  sms_test_status VARCHAR(20) DEFAULT 'pending' CHECK (sms_test_status IN ('pending', 'success', 'failed')),
  whatsapp_test_status VARCHAR(20) DEFAULT 'pending' CHECK (whatsapp_test_status IN ('pending', 'success', 'failed')),
  sms_test_error TEXT,
  whatsapp_test_error TEXT,
  last_tested_at TIMESTAMPTZ,
  connected_date TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_provider_email_integrations_provider_id 
  ON provider_email_integrations(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_email_integrations_enabled 
  ON provider_email_integrations(is_enabled) WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS idx_provider_twilio_integrations_provider_id 
  ON provider_twilio_integrations(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_twilio_integrations_sms_enabled 
  ON provider_twilio_integrations(is_sms_enabled) WHERE is_sms_enabled = true;
CREATE INDEX IF NOT EXISTS idx_provider_twilio_integrations_whatsapp_enabled 
  ON provider_twilio_integrations(is_whatsapp_enabled) WHERE is_whatsapp_enabled = true;

-- Create updated_at triggers
CREATE TRIGGER update_provider_email_integrations_updated_at
  BEFORE UPDATE ON provider_email_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_twilio_integrations_updated_at
  BEFORE UPDATE ON provider_twilio_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE provider_email_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_twilio_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Email Integrations
CREATE POLICY "Providers can view own email integrations"
  ON provider_email_integrations FOR SELECT
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Providers can create own email integrations"
  ON provider_email_integrations FOR INSERT
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Providers can update own email integrations"
  ON provider_email_integrations FOR UPDATE
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Providers can delete own email integrations"
  ON provider_email_integrations FOR DELETE
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for Twilio Integrations
CREATE POLICY "Providers can view own twilio integrations"
  ON provider_twilio_integrations FOR SELECT
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Providers can create own twilio integrations"
  ON provider_twilio_integrations FOR INSERT
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Providers can update own twilio integrations"
  ON provider_twilio_integrations FOR UPDATE
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Providers can delete own twilio integrations"
  ON provider_twilio_integrations FOR DELETE
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );

-- Add comments
COMMENT ON TABLE provider_email_integrations IS 'Provider email marketing service integrations (SendGrid or Mailchimp) for running email marketing campaigns';
COMMENT ON TABLE provider_twilio_integrations IS 'Provider SMS and WhatsApp marketing integrations via Twilio for running SMS and WhatsApp marketing campaigns';
COMMENT ON COLUMN provider_email_integrations.provider_name IS 'Email marketing service provider: sendgrid or mailchimp';
COMMENT ON COLUMN provider_twilio_integrations.sms_from_number IS 'Phone number for sending SMS marketing campaigns (e.g., +1234567890)';
COMMENT ON COLUMN provider_twilio_integrations.whatsapp_from_number IS 'WhatsApp number for sending marketing messages (e.g., whatsapp:+1234567890)';
