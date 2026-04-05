-- 356_integrations_tenant_scope.sql
-- Add tenant scoping for Mapbox and control-plane integration configs.

ALTER TABLE public.mapbox_config
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.gemini_integration_config
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.aura_integration_config
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.sumsub_integration_config
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_mapbox_config_tenant_id ON public.mapbox_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gemini_integration_config_tenant_id ON public.gemini_integration_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_aura_integration_config_tenant_id ON public.aura_integration_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sumsub_integration_config_tenant_id ON public.sumsub_integration_config(tenant_id);

-- mapbox_config singleton per-scope
-- Keep only the latest global row before adding singleton uniqueness.
WITH ranked_global_mapbox AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.mapbox_config
  WHERE tenant_id IS NULL
)
DELETE FROM public.mapbox_config m
USING ranked_global_mapbox r
WHERE m.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_mapbox_config_global
  ON public.mapbox_config((1))
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mapbox_config_tenant
  ON public.mapbox_config(tenant_id)
  WHERE tenant_id IS NOT NULL;

-- integration configs: unique per (scope, environment)
ALTER TABLE public.gemini_integration_config DROP CONSTRAINT IF EXISTS gemini_integration_config_environment_key;
ALTER TABLE public.aura_integration_config DROP CONSTRAINT IF EXISTS aura_integration_config_environment_key;
ALTER TABLE public.sumsub_integration_config DROP CONSTRAINT IF EXISTS sumsub_integration_config_environment_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_gemini_integration_config_global_env
  ON public.gemini_integration_config(environment)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_gemini_integration_config_tenant_env
  ON public.gemini_integration_config(tenant_id, environment)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_aura_integration_config_global_env
  ON public.aura_integration_config(environment)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_aura_integration_config_tenant_env
  ON public.aura_integration_config(tenant_id, environment)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sumsub_integration_config_global_env
  ON public.sumsub_integration_config(environment)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sumsub_integration_config_tenant_env
  ON public.sumsub_integration_config(tenant_id, environment)
  WHERE tenant_id IS NOT NULL;
