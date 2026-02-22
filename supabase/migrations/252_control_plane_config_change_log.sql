-- Audit log for config changes (before/after diffs)
CREATE TABLE IF NOT EXISTS config_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by UUID REFERENCES auth.users(id),
  area TEXT NOT NULL,
  record_key TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_config_change_log_created_at ON config_change_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_change_log_area ON config_change_log(area);
CREATE INDEX IF NOT EXISTS idx_config_change_log_record_key ON config_change_log(record_key);

ALTER TABLE config_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage config_change_log"
  ON config_change_log FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

COMMENT ON TABLE config_change_log IS 'Audit trail for control plane changes: flags, integrations, modules, ai_template';
