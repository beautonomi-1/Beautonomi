-- AI entitlements per subscription plan (subscription-gated AI features)
CREATE TABLE IF NOT EXISTS ai_plan_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  calls_per_day INTEGER NOT NULL DEFAULT 0,
  max_tokens INTEGER NOT NULL DEFAULT 600,
  model_tier TEXT NOT NULL DEFAULT 'cheap',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_plan_entitlements_plan_id ON ai_plan_entitlements(plan_id);
CREATE INDEX IF NOT EXISTS idx_ai_plan_entitlements_feature_key ON ai_plan_entitlements(feature_key);

ALTER TABLE ai_plan_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage ai_plan_entitlements"
  ON ai_plan_entitlements FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_ai_plan_entitlements_updated_at
  BEFORE UPDATE ON ai_plan_entitlements FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ai_plan_entitlements IS 'Per-plan AI feature entitlements: enabled, calls_per_day, max_tokens, model_tier';
