-- Payroll foundation: employment dates, canonical commission rates, location TZ,
-- pay plans, jurisdiction rule sets, pay run extensions.

-- ---------------------------------------------------------------------------
-- 1. Staff employment window (salary proration + leavers)
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_staff
  ADD COLUMN IF NOT EXISTS employment_start_date DATE,
  ADD COLUMN IF NOT EXISTS employment_end_date DATE;

COMMENT ON COLUMN public.provider_staff.employment_start_date IS
  'First day staff is eligible for pay (defaults to created_at day when null).';
COMMENT ON COLUMN public.provider_staff.employment_end_date IS
  'Last day staff is eligible for pay; null = ongoing.';

UPDATE public.provider_staff
SET employment_start_date = (created_at AT TIME ZONE 'UTC')::date
WHERE employment_start_date IS NULL AND created_at IS NOT NULL;

-- Backfill invite acceptance for existing active linked staff
UPDATE public.provider_staff
SET invite_accepted_at = COALESCE(invite_accepted_at, created_at)
WHERE user_id IS NOT NULL
  AND is_active = true
  AND invite_accepted_at IS NULL
  AND role IS DISTINCT FROM 'owner';

-- ---------------------------------------------------------------------------
-- 2. Canonical commission rates (backfill from legacy columns)
-- ---------------------------------------------------------------------------
UPDATE public.provider_staff ps
SET service_commission_rate = COALESCE(
      NULLIF(ps.service_commission_rate, 0),
      ps.commission_rate,
      ps.commission_percentage,
      0
    ),
    product_commission_rate = COALESCE(
      NULLIF(ps.product_commission_rate, 0),
      ps.commission_rate,
      ps.commission_percentage,
      0
    )
WHERE (ps.service_commission_rate IS NULL OR ps.service_commission_rate = 0)
   OR (ps.product_commission_rate IS NULL OR ps.product_commission_rate = 0);

ALTER TABLE public.provider_staff
  ALTER COLUMN service_commission_rate DROP DEFAULT,
  ALTER COLUMN product_commission_rate DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.sync_provider_staff_legacy_commission_rates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
     OR (TG_OP = 'INSERT' AND NEW.commission_rate IS NOT NULL) THEN
    IF NEW.service_commission_rate IS NULL OR NEW.service_commission_rate = 0 THEN
      NEW.service_commission_rate := NEW.commission_rate;
    END IF;
    IF NEW.product_commission_rate IS NULL OR NEW.product_commission_rate = 0 THEN
      NEW.product_commission_rate := NEW.commission_rate;
    END IF;
  END IF;
  IF NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage
     OR (TG_OP = 'INSERT' AND NEW.commission_percentage IS NOT NULL) THEN
    IF NEW.service_commission_rate IS NULL OR NEW.service_commission_rate = 0 THEN
      NEW.service_commission_rate := NEW.commission_percentage;
    END IF;
    IF NEW.product_commission_rate IS NULL OR NEW.product_commission_rate = 0 THEN
      NEW.product_commission_rate := NEW.commission_percentage;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_provider_staff_legacy_commission_rates ON public.provider_staff;
CREATE TRIGGER sync_provider_staff_legacy_commission_rates
  BEFORE INSERT OR UPDATE OF commission_rate, commission_percentage ON public.provider_staff
  FOR EACH ROW EXECUTE FUNCTION public.sync_provider_staff_legacy_commission_rates();

-- ---------------------------------------------------------------------------
-- 3. Per-location timezone (payroll + schedules)
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_locations
  ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN public.provider_locations.timezone IS
  'IANA timezone for this branch; payroll period bounds and schedules use primary work location when set.';

-- ---------------------------------------------------------------------------
-- 4. Provider payroll settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_settings
  ADD COLUMN IF NOT EXISTS commission_base TEXT NOT NULL DEFAULT 'net_after_discounts'
    CHECK (commission_base IN ('net_after_discounts', 'net_after_platform_fee')),
  ADD COLUMN IF NOT EXISTS payroll_v2_enabled BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 5. staff_pay_plans (versioned compensation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_pay_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.provider_staff(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  pay_model TEXT NOT NULL DEFAULT 'commission_only'
    CHECK (pay_model IN (
      'commission_only', 'base_plus_commission', 'base_or_commission_higher',
      'commission_above_threshold', 'hourly', 'hourly_plus_commission', 'salary', 'booth_renter'
    )),
  employment_type TEXT NOT NULL DEFAULT 'employee'
    CHECK (employment_type IN ('employee', 'contractor', 'apprentice')),
  base_amount NUMERIC(12, 2),
  base_period TEXT CHECK (base_period IS NULL OR base_period IN ('hour', 'week', 'month', 'year')),
  hourly_rate NUMERIC(12, 2),
  service_rate NUMERIC(5, 2),
  product_rate NUMERIC(5, 2),
  tier_mode TEXT NOT NULL DEFAULT 'retroactive'
    CHECK (tier_mode IN ('retroactive', 'marginal')),
  threshold_amount NUMERIC(12, 2),
  product_cost_deduction_pct NUMERIC(5, 2) DEFAULT 0,
  commission_base TEXT,
  tips_policy TEXT CHECK (tips_policy IS NULL OR tips_policy IN ('inherit', 'keep_all', 'pass_through')),
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_pay_plans_staff_effective
  ON public.staff_pay_plans(staff_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.staff_service_rate_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.provider_staff(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  rate NUMERIC(5, 2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, offering_id)
);

-- ---------------------------------------------------------------------------
-- 6. Jurisdiction packs (multi-country)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_jurisdictions (
  code TEXT PRIMARY KEY,
  parent_code TEXT REFERENCES public.payroll_jurisdictions(code),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  support_level TEXT NOT NULL DEFAULT 'manual'
    CHECK (support_level IN ('manual', 'gross_only', 'estimate', 'full')),
  tax_year_start_month INT NOT NULL DEFAULT 3 CHECK (tax_year_start_month BETWEEN 1 AND 12),
  tax_year_start_day INT NOT NULL DEFAULT 1 CHECK (tax_year_start_day BETWEEN 1 AND 31),
  default_week_start INT NOT NULL DEFAULT 1 CHECK (default_week_start BETWEEN 0 AND 6),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code TEXT NOT NULL REFERENCES public.payroll_jurisdictions(code),
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'income_tax', 'social_contributions', 'employer_levies', 'minimum_wage',
    'overtime', 'public_holidays', 'leave_entitlements', 'tips_law',
    'payslip_requirements', 'record_retention', 'contractor_rules'
  )),
  effective_from DATE NOT NULL,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'verified', 'published', 'retired')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  golden_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_by UUID REFERENCES public.users(id),
  published_by UUID REFERENCES public.users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payroll_rule_sets_window CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_payroll_rule_sets_lookup
  ON public.payroll_rule_sets(jurisdiction_code, rule_type, status, effective_from DESC);

ALTER TABLE public.provider_locations
  ADD COLUMN IF NOT EXISTS jurisdiction_code TEXT;

ALTER TABLE public.provider_staff
  ADD COLUMN IF NOT EXISTS primary_work_location_id UUID REFERENCES public.provider_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS statutory_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (statutory_mode IN ('auto', 'manual', 'none'));

-- ---------------------------------------------------------------------------
-- 7. Pay run extensions
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_pay_runs
  ADD COLUMN IF NOT EXISTS period_type TEXT NOT NULL DEFAULT 'weekly'
    CHECK (period_type IN ('weekly', 'biweekly', 'semi_monthly', 'monthly', 'custom')),
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS jurisdiction_snapshot JSONB;

CREATE TABLE IF NOT EXISTS public.provider_pay_run_item_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_run_item_id UUID NOT NULL REFERENCES public.provider_pay_run_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('earning', 'deduction', 'employer_cost', 'statutory')),
  code TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  note TEXT,
  source_rule_set_id UUID REFERENCES public.payroll_rule_sets(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pay_run_item_lines_item
  ON public.provider_pay_run_item_lines(pay_run_item_id);

ALTER TABLE public.staff_earnings_lines
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS pay_run_id UUID REFERENCES public.provider_pay_runs(id) ON DELETE SET NULL;

-- Seed ZA jurisdiction (rules published separately)
INSERT INTO public.payroll_jurisdictions (code, name, currency, support_level, tax_year_start_month, tax_year_start_day)
VALUES ('ZA', 'South Africa', 'ZAR', 'estimate', 3, 1)
ON CONFLICT (code) DO NOTHING;
