-- Slack workspace integration: OAuth install state, per-event routing, delivery audit trail.
-- API uses Supabase service role; RLS allows superadmin direct access for consistency with other integration tables.

CREATE TABLE IF NOT EXISTS slack_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'staging', 'development')),
  enabled BOOLEAN NOT NULL DEFAULT false,

  team_id TEXT,
  team_name TEXT,
  bot_user_id TEXT,
  bot_token_secret TEXT,
  installed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  installed_at TIMESTAMPTZ,

  -- Per-event routing: { "support.ticket.urgent_created": { "enabled", "channel_id", "channel_label", "dedupe_window_seconds" }, ... }
  routing JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_slack_config_global_env
  ON slack_integration_config(environment)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_slack_config_tenant_env
  ON slack_integration_config(tenant_id, environment)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_slack_config_tenant ON slack_integration_config(tenant_id);

ALTER TABLE slack_integration_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage slack config"
  ON slack_integration_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_slack_integration_config_updated_at
  BEFORE UPDATE ON slack_integration_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS slack_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'staging', 'development')),
  event_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  channel_id TEXT,
  slack_ts TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped_dedupe', 'skipped_disabled', 'failed', 'skipped_no_channel')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slack_delivery_tenant_time
  ON slack_delivery_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_slack_delivery_dedupe
  ON slack_delivery_logs(tenant_id, event_key, dedupe_key, created_at DESC);

ALTER TABLE slack_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can read slack delivery logs"
  ON slack_delivery_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

COMMENT ON TABLE slack_integration_config IS 'Slack OAuth (workspace) install and per-event channel routing for admin alerts.';
COMMENT ON TABLE slack_delivery_logs IS 'Slack message delivery outcomes for deduplication and operator visibility.';
