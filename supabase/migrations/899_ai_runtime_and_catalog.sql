-- Migration 899: AI runtime config, model catalog, emergency controls, template model override

CREATE TABLE IF NOT EXISTS public.ai_runtime_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  runtime TEXT NOT NULL DEFAULT 'direct_gemini'
    CHECK (runtime IN ('direct_gemini', 'vercel_gateway', 'direct_openai', 'direct_anthropic')),
  gateway_api_key_secret TEXT,
  openai_api_key_secret TEXT,
  anthropic_api_key_secret TEXT,
  default_model_id TEXT NOT NULL DEFAULT 'gemini-2.5-flash-lite',
  failover_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_runtime_config_tenant_id ON public.ai_runtime_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_runtime_config_environment ON public.ai_runtime_config(environment);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_runtime_config_global_env
  ON public.ai_runtime_config(environment)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_runtime_config_tenant_env
  ON public.ai_runtime_config(tenant_id, environment)
  WHERE tenant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_model_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'development')) DEFAULT 'production',
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gemini',
  tier TEXT NOT NULL DEFAULT 'lite' CHECK (tier IN ('lite', 'flash', 'pro')),
  capability TEXT NOT NULL DEFAULT 'chat' CHECK (capability IN ('chat', 'vision', 'embedding')),
  gateway BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  eval_passed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_model_catalog_env ON public.ai_model_catalog(environment);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_model_catalog_global
  ON public.ai_model_catalog(environment, model_id)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_model_catalog_tenant
  ON public.ai_model_catalog(tenant_id, environment, model_id)
  WHERE tenant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_emergency_controls (
  environment TEXT PRIMARY KEY CHECK (environment IN ('production', 'staging', 'development')),
  stop_all_calls BOOLEAN NOT NULL DEFAULT false,
  force_template_fallback BOOLEAN NOT NULL DEFAULT false,
  disable_streaming BOOLEAN NOT NULL DEFAULT false,
  disable_vision BOOLEAN NOT NULL DEFAULT false,
  disable_embeddings BOOLEAN NOT NULL DEFAULT false,
  activated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  reason TEXT
);

INSERT INTO public.ai_emergency_controls (environment)
VALUES ('production'), ('staging'), ('development')
ON CONFLICT (environment) DO NOTHING;

ALTER TABLE public.ai_prompt_templates
  ADD COLUMN IF NOT EXISTS model_id TEXT;

ALTER TABLE public.ai_runtime_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_emergency_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_runtime_config_superadmin ON public.ai_runtime_config;
CREATE POLICY ai_runtime_config_superadmin ON public.ai_runtime_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP POLICY IF EXISTS ai_model_catalog_superadmin ON public.ai_model_catalog;
CREATE POLICY ai_model_catalog_superadmin ON public.ai_model_catalog FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP POLICY IF EXISTS ai_emergency_controls_superadmin ON public.ai_emergency_controls;
CREATE POLICY ai_emergency_controls_superadmin ON public.ai_emergency_controls FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP TRIGGER IF EXISTS update_ai_runtime_config_updated_at ON public.ai_runtime_config;
CREATE TRIGGER update_ai_runtime_config_updated_at
  BEFORE UPDATE ON public.ai_runtime_config FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_model_catalog_updated_at ON public.ai_model_catalog;
CREATE TRIGGER update_ai_model_catalog_updated_at
  BEFORE UPDATE ON public.ai_model_catalog FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed direct Gemini catalog (enabled) for all environments
INSERT INTO public.ai_model_catalog (environment, tenant_id, model_id, provider, tier, capability, gateway, enabled)
SELECT e.env, NULL, m.model_id, m.provider, m.tier, 'chat', false, true
FROM (VALUES ('production'), ('staging'), ('development')) AS e(env)
CROSS JOIN (
  VALUES
    ('gemini-2.5-flash-lite', 'gemini', 'lite'),
    ('gemini-2.5-flash', 'gemini', 'flash'),
    ('gemini-2.5-pro', 'gemini', 'pro')
) AS m(model_id, provider, tier)
ON CONFLICT (environment, model_id) WHERE (tenant_id IS NULL) DO NOTHING;

-- Seed Gateway rows (disabled until admin enables)
INSERT INTO public.ai_model_catalog (environment, tenant_id, model_id, provider, tier, capability, gateway, enabled)
SELECT e.env, NULL, m.model_id, m.provider, m.tier, m.capability, true, false
FROM (VALUES ('production'), ('staging'), ('development')) AS e(env)
CROSS JOIN (
  VALUES
    ('google/gemini-2.5-flash-lite', 'google', 'lite', 'chat'),
    ('google/gemini-2.5-flash', 'google', 'flash', 'chat'),
    ('openai/gpt-4.1-mini', 'openai', 'lite', 'chat'),
    ('anthropic/claude-sonnet-4.5', 'anthropic', 'flash', 'chat'),
    ('openai/text-embedding-3-small', 'openai', 'lite', 'embedding')
) AS m(model_id, provider, tier, capability)
ON CONFLICT (environment, model_id) WHERE (tenant_id IS NULL) DO NOTHING;
