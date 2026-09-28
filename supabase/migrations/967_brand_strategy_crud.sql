-- Brand strategy CRUD lifecycle, KPI targets, snapshots, pacing settings.

ALTER TABLE public.brand_strategies
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pending_approval_id uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.brand_pillars
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS budget_target numeric(14, 2),
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.brand_plans
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.brand_settings
  ADD COLUMN IF NOT EXISTS pacing_at_risk_pct smallint NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS pacing_off_track_pct smallint NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS stale_data_days smallint NOT NULL DEFAULT 14;

CREATE TABLE IF NOT EXISTS public.brand_strategy_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  strategy_id uuid NOT NULL REFERENCES public.brand_strategies(id) ON DELETE CASCADE,
  pillar_id uuid REFERENCES public.brand_pillars(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.brand_plans(id) ON DELETE CASCADE,
  kpi_key text NOT NULL,
  target numeric(18, 4) NOT NULL,
  weight smallint NOT NULL DEFAULT 1,
  baseline numeric(18, 4),
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_strategy_kpis_level CHECK (
    (pillar_id IS NULL AND plan_id IS NULL)
    OR (pillar_id IS NOT NULL AND plan_id IS NULL)
    OR (pillar_id IS NOT NULL AND plan_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS brand_strategy_kpis_unique_active
  ON public.brand_strategy_kpis (strategy_id, COALESCE(pillar_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(plan_id, '00000000-0000-0000-0000-000000000000'::uuid), kpi_key)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.brand_strategy_kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kpi_id uuid NOT NULL REFERENCES public.brand_strategy_kpis(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  actual numeric(18, 4) NOT NULL DEFAULT 0,
  expected_to_date numeric(18, 4) NOT NULL DEFAULT 0,
  status text NOT NULL,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_strategy_kpi_snapshots_unique UNIQUE (kpi_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_brand_pillars_tenant_strategy ON public.brand_pillars (tenant_id, strategy_id);
CREATE INDEX IF NOT EXISTS idx_brand_plans_tenant_pillar ON public.brand_plans (tenant_id, pillar_id);
CREATE INDEX IF NOT EXISTS idx_brand_strategy_kpis_tenant ON public.brand_strategy_kpis (tenant_id, strategy_id);

CREATE UNIQUE INDEX IF NOT EXISTS brand_pillars_name_per_strategy_active
  ON public.brand_pillars (strategy_id, lower(name))
  WHERE archived_at IS NULL;

-- Migrate legacy pillar kpi_key/kpi_target into brand_strategy_kpis
INSERT INTO public.brand_strategy_kpis (tenant_id, strategy_id, pillar_id, kpi_key, target)
SELECT p.tenant_id, p.strategy_id, p.id, p.kpi_key, p.kpi_target
FROM public.brand_pillars p
WHERE p.kpi_key IS NOT NULL
  AND p.kpi_target IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.brand_strategy_kpis k
    WHERE k.pillar_id = p.id AND k.plan_id IS NULL AND k.kpi_key = p.kpi_key AND k.archived_at IS NULL
  );

CREATE OR REPLACE FUNCTION public.brand_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brand_strategies_updated_at ON public.brand_strategies;
CREATE TRIGGER brand_strategies_updated_at
  BEFORE UPDATE ON public.brand_strategies
  FOR EACH ROW EXECUTE FUNCTION public.brand_touch_updated_at();

DROP TRIGGER IF EXISTS brand_pillars_updated_at ON public.brand_pillars;
CREATE TRIGGER brand_pillars_updated_at
  BEFORE UPDATE ON public.brand_pillars
  FOR EACH ROW EXECUTE FUNCTION public.brand_touch_updated_at();

DROP TRIGGER IF EXISTS brand_plans_updated_at ON public.brand_plans;
CREATE TRIGGER brand_plans_updated_at
  BEFORE UPDATE ON public.brand_plans
  FOR EACH ROW EXECUTE FUNCTION public.brand_touch_updated_at();

DROP TRIGGER IF EXISTS brand_strategy_kpis_updated_at ON public.brand_strategy_kpis;
CREATE TRIGGER brand_strategy_kpis_updated_at
  BEFORE UPDATE ON public.brand_strategy_kpis
  FOR EACH ROW EXECUTE FUNCTION public.brand_touch_updated_at();

ALTER TABLE public.brand_strategy_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_strategy_kpi_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_strategy_kpis_service ON public.brand_strategy_kpis;
CREATE POLICY brand_strategy_kpis_service ON public.brand_strategy_kpis FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_strategy_kpi_snapshots_service ON public.brand_strategy_kpi_snapshots;
CREATE POLICY brand_strategy_kpi_snapshots_service ON public.brand_strategy_kpi_snapshots FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS brand_strategy_kpi_snapshots_no_update ON public.brand_strategy_kpi_snapshots;
CREATE TRIGGER brand_strategy_kpi_snapshots_no_update
  BEFORE UPDATE OR DELETE ON public.brand_strategy_kpi_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.brand_prevent_mutation();
