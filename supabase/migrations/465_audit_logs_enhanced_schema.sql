-- Enhanced audit_logs schema for accountability, retention, and investigation.
-- Adds structured fields for risk classification, before/after state, request metadata,
-- retention management, and superadmin tracking.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS module TEXT,
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'succeeded'
    CHECK (status IN ('attempted', 'succeeded', 'failed')),
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS before_json JSONB,
  ADD COLUMN IF NOT EXISTS after_json JSONB,
  ADD COLUMN IF NOT EXISTS changed_fields TEXT[],
  ADD COLUMN IF NOT EXISTS retention_tier TEXT DEFAULT 'routine'
    CHECK (retention_tier IN ('permanent', 'financial', 'access', 'operational', 'routine', 'low')),
  ADD COLUMN IF NOT EXISTS purge_after_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superadmin_bypass_used BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_audit_logs_risk_level ON audit_logs(risk_level);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module) WHERE module IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_retention_tier ON audit_logs(retention_tier);
CREATE INDEX IF NOT EXISTS idx_audit_logs_purge_after ON audit_logs(purge_after_at)
  WHERE purge_after_at IS NOT NULL;

COMMENT ON COLUMN audit_logs.risk_level IS 'Action risk classification: low, medium, high, critical';
COMMENT ON COLUMN audit_logs.status IS 'Whether the action succeeded, failed, or was only attempted';
COMMENT ON COLUMN audit_logs.reason IS 'Admin-provided justification for the action';
COMMENT ON COLUMN audit_logs.before_json IS 'Entity state before mutation (redacted of secrets)';
COMMENT ON COLUMN audit_logs.after_json IS 'Entity state after mutation (redacted of secrets)';
COMMENT ON COLUMN audit_logs.changed_fields IS 'Array of field names that changed';
COMMENT ON COLUMN audit_logs.retention_tier IS 'Determines how long the log is kept';
COMMENT ON COLUMN audit_logs.purge_after_at IS 'Computed expiry timestamp for retention-based cleanup';
COMMENT ON COLUMN audit_logs.superadmin_bypass_used IS 'Whether superadmin bypassed normal authorization';
