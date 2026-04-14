-- WhatsApp (WasenderAPI) integration: config, sessions, templates, message queue, bulk batches, number checks
-- Part of Provider Ops Hub lead outreach tooling

-- ============================================================================
-- 1. wasender_integration_config — per-tenant, per-environment WasenderAPI credentials + safety knobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS wasender_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'staging', 'development')),
  enabled BOOLEAN NOT NULL DEFAULT false,

  personal_access_token_secret TEXT,
  webhook_secret TEXT,
  base_url TEXT NOT NULL DEFAULT 'https://app.wasenderapi.com',

  default_session_id UUID,

  bulk_pacing_ms INTEGER NOT NULL DEFAULT 5000 CHECK (bulk_pacing_ms >= 3000),
  bulk_batch_size_limit INTEGER NOT NULL DEFAULT 50 CHECK (bulk_batch_size_limit BETWEEN 1 AND 100),
  daily_send_limit_per_session INTEGER NOT NULL DEFAULT 200 CHECK (daily_send_limit_per_session BETWEEN 50 AND 500),
  hourly_send_limit_per_session INTEGER NOT NULL DEFAULT 30 CHECK (hourly_send_limit_per_session BETWEEN 10 AND 60),
  max_concurrent_per_session INTEGER NOT NULL DEFAULT 1 CHECK (max_concurrent_per_session BETWEEN 1 AND 3),
  auto_pause_on_failure_count INTEGER NOT NULL DEFAULT 3 CHECK (auto_pause_on_failure_count BETWEEN 1 AND 20),
  cooldown_minutes_after_pause INTEGER NOT NULL DEFAULT 30 CHECK (cooldown_minutes_after_pause BETWEEN 5 AND 1440),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wasender_config_global_env
  ON wasender_integration_config(environment)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wasender_config_tenant_env
  ON wasender_integration_config(tenant_id, environment)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wasender_config_tenant ON wasender_integration_config(tenant_id);

ALTER TABLE wasender_integration_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage wasender config"
  ON wasender_integration_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_wasender_integration_config_updated_at
  BEFORE UPDATE ON wasender_integration_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. whatsapp_sessions — linked WhatsApp numbers / WasenderAPI sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wasender_session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'qr_required', 'connecting', 'error')),
  is_active BOOLEAN NOT NULL DEFAULT true,

  daily_send_count INTEGER NOT NULL DEFAULT 0,
  hourly_send_count INTEGER NOT NULL DEFAULT 0,
  last_send_count_reset_at TIMESTAMPTZ DEFAULT NOW(),

  is_paused BOOLEAN NOT NULL DEFAULT false,
  pause_reason TEXT,
  paused_at TIMESTAMPTZ,

  last_status_check_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_tenant ON whatsapp_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_active ON whatsapp_sessions(tenant_id, is_active) WHERE is_active = true;

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage whatsapp_sessions"
  ON whatsapp_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid()
      AND users.role IN ('superadmin', 'admin_integrations', 'admin_operations')
    )
  );

CREATE TRIGGER update_whatsapp_sessions_updated_at
  BEFORE UPDATE ON whatsapp_sessions FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- FK from config to sessions (deferred so sessions table exists first)
ALTER TABLE wasender_integration_config
  ADD CONSTRAINT fk_wasender_config_default_session
  FOREIGN KEY (default_session_id)
  REFERENCES whatsapp_sessions(id)
  ON DELETE SET NULL;

-- ============================================================================
-- 3. whatsapp_templates — predefined message templates with placeholders
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom'
    CHECK (category IN ('cold_intro', 'follow_up', 'hot_lead', 'pricing_info', 're_engagement', 'custom')),
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_tenant ON whatsapp_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_active ON whatsapp_templates(tenant_id, is_active, sort_order)
  WHERE is_active = true;

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ops admins can manage whatsapp_templates"
  ON whatsapp_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid()
      AND users.role IN ('superadmin', 'admin_operations', 'admin_support', 'admin_marketing')
    )
  );

CREATE TRIGGER update_whatsapp_templates_updated_at
  BEFORE UPDATE ON whatsapp_templates FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. whatsapp_bulk_batches — tracks each bulk send campaign
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_bulk_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  template_id UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  queued_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  cancelled_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'paused', 'completed', 'cancelled')),
  pause_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_bulk_batches_tenant ON whatsapp_bulk_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_bulk_batches_status ON whatsapp_bulk_batches(status)
  WHERE status IN ('queued', 'processing');

ALTER TABLE whatsapp_bulk_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ops admins can manage whatsapp_bulk_batches"
  ON whatsapp_bulk_batches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid()
      AND users.role IN ('superadmin', 'admin_operations', 'admin_support')
    )
  );

CREATE TRIGGER update_whatsapp_bulk_batches_updated_at
  BEFORE UPDATE ON whatsapp_bulk_batches FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. whatsapp_message_queue — individual queued/sent messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES provider_leads(id) ON DELETE SET NULL,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  template_id UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  bulk_batch_id UUID REFERENCES whatsapp_bulk_batches(id) ON DELETE SET NULL,

  to_number TEXT NOT NULL,
  message_body TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled', 'rate_limited')),
  priority INTEGER NOT NULL DEFAULT 0,

  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  failure_code TEXT,

  external_message_id TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,
  next_retry_at TIMESTAMPTZ,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_queue_pickup
  ON whatsapp_message_queue(status, scheduled_at)
  WHERE status IN ('queued', 'rate_limited');
CREATE INDEX IF NOT EXISTS idx_wa_queue_batch ON whatsapp_message_queue(bulk_batch_id)
  WHERE bulk_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_queue_lead ON whatsapp_message_queue(lead_id)
  WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_queue_session ON whatsapp_message_queue(session_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_queue_external_msg ON whatsapp_message_queue(external_message_id)
  WHERE external_message_id IS NOT NULL;

ALTER TABLE whatsapp_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ops admins can manage whatsapp_message_queue"
  ON whatsapp_message_queue FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid()
      AND users.role IN ('superadmin', 'admin_operations', 'admin_support')
    )
  );

CREATE TRIGGER update_whatsapp_message_queue_updated_at
  BEFORE UPDATE ON whatsapp_message_queue FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. whatsapp_number_checks — verification cache
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_number_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  is_on_whatsapp BOOLEAN,
  check_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (check_status IN ('unknown', 'verified', 'not_found', 'failed')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_wa_number_checks_phone ON whatsapp_number_checks(tenant_id, phone_e164);

ALTER TABLE whatsapp_number_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ops admins can manage whatsapp_number_checks"
  ON whatsapp_number_checks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid()
      AND users.role IN ('superadmin', 'admin_operations', 'admin_support', 'admin_marketing')
    )
  );

-- ============================================================================
-- 7. Add whatsapp columns to provider_leads
-- ============================================================================

ALTER TABLE provider_leads
  ADD COLUMN IF NOT EXISTS whatsapp_status TEXT DEFAULT 'unknown'
    CHECK (whatsapp_status IS NULL OR whatsapp_status IN ('unknown', 'verified', 'not_found', 'check_failed'));

ALTER TABLE provider_leads
  ADD COLUMN IF NOT EXISTS whatsapp_checked_at TIMESTAMPTZ;

-- ============================================================================
-- 8. Seed default templates (tenant_id NULL = global defaults)
-- ============================================================================

INSERT INTO whatsapp_templates (tenant_id, name, category, body, sort_order) VALUES
  (NULL, 'Cold Intro', 'cold_intro',
   E'Hi {{first_name}}, I''m reaching out from Beautonomi. We help beauty and wellness businesses like {{business_name}} get discovered by more clients and manage bookings effortlessly.\n\nWould you be open to a quick chat about how we can help grow your business?',
   1),
  (NULL, 'Follow-up', 'follow_up',
   E'Hi {{first_name}}, just checking in on our earlier conversation about getting {{business_name}} set up on Beautonomi.\n\nIs there anything I can help answer or clarify? Happy to walk you through the process.',
   2),
  (NULL, 'Hot Lead Follow-up', 'hot_lead',
   E'Hi {{first_name}}, great news! We''d love to get {{business_name}} onboarded as soon as possible.\n\nI can help you get started right now — it only takes a few minutes. Shall I send you the setup link?',
   3),
  (NULL, 'Pricing & Info', 'pricing_info',
   E'Hi {{first_name}}, here''s the pricing information for {{business_name}} on Beautonomi:\n\n• Free to list your business\n• Commission only on bookings made through the platform\n• No monthly fees to get started\n\nWould you like me to share more details?',
   4),
  (NULL, 'Re-engagement', 're_engagement',
   E'Hi {{first_name}}, it''s been a while since we last connected about {{business_name}} joining Beautonomi.\n\nWe''ve added some exciting new features that might interest you. Would you like to hear what''s new?',
   5)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. Comments
-- ============================================================================

COMMENT ON TABLE wasender_integration_config IS 'WasenderAPI integration credentials and safety configuration per tenant/environment.';
COMMENT ON TABLE whatsapp_sessions IS 'Linked WhatsApp numbers via WasenderAPI. Each session represents one connected WhatsApp account.';
COMMENT ON TABLE whatsapp_templates IS 'Predefined WhatsApp message templates with placeholder support for lead outreach.';
COMMENT ON TABLE whatsapp_bulk_batches IS 'Tracks bulk WhatsApp send campaigns with status counters.';
COMMENT ON TABLE whatsapp_message_queue IS 'Queued WhatsApp messages processed by cron. Supports pacing, retries, and rate limiting.';
COMMENT ON TABLE whatsapp_number_checks IS 'Cache of WhatsApp number verification results to avoid repeated API calls.';
COMMENT ON COLUMN provider_leads.whatsapp_status IS 'Whether this lead phone number has been verified as active on WhatsApp.';
COMMENT ON COLUMN provider_leads.whatsapp_checked_at IS 'When the WhatsApp number verification was last performed.';
