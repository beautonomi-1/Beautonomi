-- Module configs: one row per environment (env-scoped)

-- On-demand UX (ringtone, waiting screen)
CREATE TABLE IF NOT EXISTS on_demand_module_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  enabled BOOLEAN NOT NULL DEFAULT false,
  ringtone_asset_path TEXT,
  ring_duration_seconds INTEGER NOT NULL DEFAULT 20,
  ring_repeat BOOLEAN NOT NULL DEFAULT true,
  waiting_screen_timeout_seconds INTEGER NOT NULL DEFAULT 45,
  provider_accept_window_seconds INTEGER NOT NULL DEFAULT 30,
  ui_copy JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment)
);

CREATE INDEX IF NOT EXISTS idx_on_demand_module_config_environment ON on_demand_module_config(environment);

ALTER TABLE on_demand_module_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage on_demand_module_config"
  ON on_demand_module_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_on_demand_module_config_updated_at
  BEFORE UPDATE ON on_demand_module_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- AI module
CREATE TABLE IF NOT EXISTS ai_module_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  enabled BOOLEAN NOT NULL DEFAULT false,
  sampling_rate INTEGER NOT NULL DEFAULT 0,
  cache_ttl_seconds INTEGER NOT NULL DEFAULT 86400,
  default_model_tier TEXT NOT NULL DEFAULT 'cheap',
  max_tokens INTEGER NOT NULL DEFAULT 600,
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.3 CHECK (temperature >= 0 AND temperature <= 2),
  daily_budget_credits INTEGER NOT NULL DEFAULT 0,
  per_provider_calls_per_day INTEGER NOT NULL DEFAULT 0,
  per_user_calls_per_day INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment)
);

CREATE INDEX IF NOT EXISTS idx_ai_module_config_environment ON ai_module_config(environment);

ALTER TABLE ai_module_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage ai_module_config"
  ON ai_module_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_ai_module_config_updated_at
  BEFORE UPDATE ON ai_module_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Ads module (stub)
CREATE TABLE IF NOT EXISTS ads_module_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  enabled BOOLEAN NOT NULL DEFAULT false,
  model TEXT,
  disclosure_label TEXT,
  max_sponsored_slots INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment)
);

CREATE INDEX IF NOT EXISTS idx_ads_module_config_environment ON ads_module_config(environment);

ALTER TABLE ads_module_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage ads_module_config"
  ON ads_module_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_ads_module_config_updated_at
  BEFORE UPDATE ON ads_module_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Ranking module (stub)
CREATE TABLE IF NOT EXISTS ranking_module_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  enabled BOOLEAN NOT NULL DEFAULT false,
  weights JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment)
);

CREATE INDEX IF NOT EXISTS idx_ranking_module_config_environment ON ranking_module_config(environment);

ALTER TABLE ranking_module_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage ranking_module_config"
  ON ranking_module_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_ranking_module_config_updated_at
  BEFORE UPDATE ON ranking_module_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Distance module (stub)
CREATE TABLE IF NOT EXISTS distance_module_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  enabled BOOLEAN NOT NULL DEFAULT false,
  default_radius_km NUMERIC(6,2),
  max_radius_km NUMERIC(6,2),
  step_km NUMERIC(4,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(environment)
);

CREATE INDEX IF NOT EXISTS idx_distance_module_config_environment ON distance_module_config(environment);

ALTER TABLE distance_module_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage distance_module_config"
  ON distance_module_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_distance_module_config_updated_at
  BEFORE UPDATE ON distance_module_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
