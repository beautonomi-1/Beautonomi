-- Per-tenant feature flag overrides. Global definitions keep tenant_id NULL.

ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN feature_flags.tenant_id IS 'When set, this row overrides the global row (tenant_id IS NULL) for the same feature_key in that tenant.';

ALTER TABLE feature_flags DROP CONSTRAINT IF EXISTS feature_flags_feature_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_feature_key_global_unique
  ON feature_flags (feature_key)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_tenant_id_feature_key_unique
  ON feature_flags (tenant_id, feature_key)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant_id
  ON feature_flags (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- Two-arg: tenant override wins when tenant_id_param is not null; else global only.
CREATE OR REPLACE FUNCTION is_feature_enabled(feature_key_param TEXT, tenant_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  feature_enabled BOOLEAN;
BEGIN
  IF tenant_id_param IS NULL THEN
    SELECT f.enabled INTO feature_enabled
    FROM feature_flags f
    WHERE f.feature_key = feature_key_param AND f.tenant_id IS NULL;
  ELSE
    SELECT f.enabled INTO feature_enabled
    FROM feature_flags f
    WHERE f.feature_key = feature_key_param
      AND (f.tenant_id = tenant_id_param OR f.tenant_id IS NULL)
    ORDER BY CASE WHEN f.tenant_id IS NOT NULL THEN 0 ELSE 1 END
    LIMIT 1;
  END IF;

  RETURN COALESCE(feature_enabled, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Single-argument: global row only (backward compatible for existing callers).
CREATE OR REPLACE FUNCTION is_feature_enabled(feature_key_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN is_feature_enabled(feature_key_param, NULL::uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
