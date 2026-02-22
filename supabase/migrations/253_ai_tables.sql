-- AI prompt templates (versioned)
CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  platform_scopes TEXT[] DEFAULT NULL,
  role_scopes TEXT[] DEFAULT NULL,
  template TEXT NOT NULL DEFAULT '',
  system_instructions TEXT NOT NULL DEFAULT '',
  output_schema JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(key, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_key ON ai_prompt_templates(key);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_key_version ON ai_prompt_templates(key, version);

ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage ai_prompt_templates"
  ON ai_prompt_templates FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_ai_prompt_templates_updated_at
  BEFORE UPDATE ON ai_prompt_templates FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- AI usage log (for budgets and cost)
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id),
  provider_id UUID REFERENCES providers(id),
  feature_key TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_estimate NUMERIC(12,6) DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_actor_created ON ai_usage_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_provider_created ON ai_usage_log(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_feature_created ON ai_usage_log(feature_key, created_at DESC);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view ai_usage_log"
  ON ai_usage_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

-- Allow inserts from backend (service role bypasses RLS; anon cannot insert)
CREATE POLICY "Allow insert ai_usage_log"
  ON ai_usage_log FOR INSERT
  WITH CHECK (true);

-- AI response cache
CREATE TABLE IF NOT EXISTS ai_cache (
  key_hash TEXT PRIMARY KEY,
  feature_key TEXT NOT NULL,
  provider_id UUID REFERENCES providers(id),
  response JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires_at ON ai_cache(expires_at);

ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;

-- Only superadmins via RLS; API uses service role (bypasses RLS) for cache read/write
CREATE POLICY "Superadmins can manage ai_cache"
  ON ai_cache FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );
