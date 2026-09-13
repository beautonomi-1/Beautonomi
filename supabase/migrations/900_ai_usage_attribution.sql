-- Migration 900: AI usage attribution and module budget extensions

ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS model_provider TEXT,
  ADD COLUMN IF NOT EXISTS runtime TEXT,
  ADD COLUMN IF NOT EXISTS gateway BOOLEAN,
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS breaker_tripped BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_tenant_created
  ON public.ai_usage_log(tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_model_created
  ON public.ai_usage_log(model, created_at DESC);

UPDATE public.ai_usage_log
SET
  model_provider = COALESCE(model_provider, 'gemini'),
  runtime = COALESCE(runtime, 'direct_gemini'),
  gateway = COALESCE(gateway, false)
WHERE model_provider IS NULL OR runtime IS NULL OR gateway IS NULL;

ALTER TABLE public.ai_module_config
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS monthly_budget_usd NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS alert_threshold_pct INTEGER NOT NULL DEFAULT 80
    CHECK (alert_threshold_pct >= 1 AND alert_threshold_pct <= 100);

-- Allow one global row and per-tenant rows per environment (replaces UNIQUE(environment)).
ALTER TABLE public.ai_module_config
  DROP CONSTRAINT IF EXISTS ai_module_config_environment_key;

CREATE INDEX IF NOT EXISTS idx_ai_module_config_tenant_id ON public.ai_module_config(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_module_config_global_env
  ON public.ai_module_config(environment)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_module_config_tenant_env
  ON public.ai_module_config(tenant_id, environment)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS ai_opt_out BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.providers.ai_opt_out IS 'When true, provider AI features are disabled for this business regardless of plan entitlements.';
