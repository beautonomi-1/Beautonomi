-- Superadmin feature flag for statutory payroll, and turn provider payroll v2 on.
-- Until this runs, feature_flags has no payroll.v2 row (superadmin list cannot show it)
-- and provider_settings.payroll_v2_enabled stays at the migration 938 default (false),
-- so pay runs never apply PAYE/UIF.

INSERT INTO public.feature_flags (
  feature_key,
  feature_name,
  description,
  enabled,
  category
)
SELECT
  'payroll.v2',
  'Payroll v2 (statutory)',
  'Platform switch for PAYE and UIF on pay runs. A provider also needs provider_settings.payroll_v2_enabled.',
  true,
  'provider'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags
  WHERE feature_key = 'payroll.v2' AND tenant_id IS NULL
);

UPDATE public.feature_flags
SET
  enabled = true,
  feature_name = 'Payroll v2 (statutory)',
  description = 'Platform switch for PAYE and UIF on pay runs. A provider also needs provider_settings.payroll_v2_enabled.',
  category = 'provider'
WHERE feature_key = 'payroll.v2'
  AND tenant_id IS NULL;

ALTER TABLE public.provider_settings
  ALTER COLUMN payroll_v2_enabled SET DEFAULT true;

UPDATE public.provider_settings
SET payroll_v2_enabled = true
WHERE payroll_v2_enabled IS DISTINCT FROM true;
