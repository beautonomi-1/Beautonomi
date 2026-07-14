-- Calls integration config: Twilio Voice toggle + Salestrail Push API webhook

CREATE TABLE IF NOT EXISTS voice_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  twilio_voice_enabled BOOLEAN NOT NULL DEFAULT false,
  salestrail_enabled BOOLEAN NOT NULL DEFAULT false,
  salestrail_webhook_username TEXT,
  salestrail_webhook_password TEXT,
  salestrail_default_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_voice_integration_config_global
  ON voice_integration_config((tenant_id IS NULL))
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_voice_integration_config_tenant
  ON voice_integration_config(tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_voice_integration_config_tenant
  ON voice_integration_config(tenant_id);

ALTER TABLE voice_integration_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage voice integration config"
  ON voice_integration_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_voice_integration_config_updated_at
  BEFORE UPDATE ON voice_integration_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE voice_integration_config IS
  'Provider Ops call sources: Twilio in-browser Voice dialer and Salestrail mobile call tracking.';

CREATE INDEX IF NOT EXISTS idx_provider_lead_comms_external_message_id
  ON provider_lead_communications(external_message_id)
  WHERE external_message_id IS NOT NULL;
