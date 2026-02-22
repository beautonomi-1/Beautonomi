-- Gemini integration (env-scoped); secrets server-side only
CREATE TABLE IF NOT EXISTS gemini_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  enabled BOOLEAN NOT NULL DEFAULT false,
  api_key_secret TEXT,
  default_model TEXT DEFAULT 'gemini-1.5-flash',
  allowed_models JSONB DEFAULT '["gemini-1.5-flash","gemini-1.5-pro"]'::jsonb,
  safety_settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment)
);

CREATE INDEX IF NOT EXISTS idx_gemini_integration_config_environment ON gemini_integration_config(environment);

ALTER TABLE gemini_integration_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage gemini config"
  ON gemini_integration_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_gemini_integration_config_updated_at
  BEFORE UPDATE ON gemini_integration_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Sumsub integration (env-scoped)
CREATE TABLE IF NOT EXISTS sumsub_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  enabled BOOLEAN NOT NULL DEFAULT false,
  app_token_secret TEXT,
  secret_key_secret TEXT,
  webhook_secret_secret TEXT,
  level_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment)
);

CREATE INDEX IF NOT EXISTS idx_sumsub_integration_config_environment ON sumsub_integration_config(environment);

ALTER TABLE sumsub_integration_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage sumsub config"
  ON sumsub_integration_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_sumsub_integration_config_updated_at
  BEFORE UPDATE ON sumsub_integration_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Aura integration (env-scoped)
CREATE TABLE IF NOT EXISTS aura_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  enabled BOOLEAN NOT NULL DEFAULT false,
  api_key_secret TEXT,
  org_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment)
);

CREATE INDEX IF NOT EXISTS idx_aura_integration_config_environment ON aura_integration_config(environment);

ALTER TABLE aura_integration_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage aura config"
  ON aura_integration_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_aura_integration_config_updated_at
  BEFORE UPDATE ON aura_integration_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
