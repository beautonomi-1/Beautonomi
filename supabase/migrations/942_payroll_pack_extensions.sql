-- Payroll pack extensions: second verifier, comparison snapshot, encrypted tax id, ZA rule seeds.

ALTER TABLE public.payroll_rule_sets
  ADD COLUMN IF NOT EXISTS verified_by_secondary UUID REFERENCES public.users(id);

ALTER TABLE public.provider_pay_runs
  ADD COLUMN IF NOT EXISTS comparison_snapshot JSONB;

ALTER TABLE public.provider_staff
  ADD COLUMN IF NOT EXISTS tax_identifier_encrypted TEXT;

COMMENT ON COLUMN public.provider_staff.tax_identifier_encrypted IS
  'AES-GCM encrypted tax / ID number; plaintext never stored.';

INSERT INTO public.payroll_rule_sets (
  jurisdiction_code, rule_type, effective_from, status, data, sources, golden_tests
)
SELECT
  'ZA',
  'minimum_wage',
  '2026-03-01'::date,
  'published',
  '{"hourlyRate": 28.79, "currency": "ZAR"}'::jsonb,
  '[{"url": "https://www.gov.za/", "title": "National Minimum Wage", "retrieved": "2026-03-01"}]'::jsonb,
  '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_rule_sets
  WHERE jurisdiction_code = 'ZA' AND rule_type = 'minimum_wage' AND status = 'published'
);

INSERT INTO public.payroll_rule_sets (
  jurisdiction_code, rule_type, effective_from, status, data, sources, golden_tests
)
SELECT
  'ZA',
  'overtime',
  '2026-03-01'::date,
  'published',
  '{"weeklyThresholdHours": 45, "multiplier": 1.5, "sundayMultiplier": 2, "publicHolidayMultiplier": 2}'::jsonb,
  '[{"url": "https://www.labour.gov.za/", "title": "BCEA overtime", "retrieved": "2026-03-01"}]'::jsonb,
  '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_rule_sets
  WHERE jurisdiction_code = 'ZA' AND rule_type = 'overtime' AND status = 'published'
);

INSERT INTO public.payroll_rule_sets (
  jurisdiction_code, rule_type, effective_from, status, data, sources, golden_tests
)
SELECT
  'ZA',
  'tips_law',
  '2026-03-01'::date,
  'published',
  '{"staffMustReceiveTips": true, "blockedPolicies": ["keep_all"]}'::jsonb,
  '[{"url": "https://www.labour.gov.za/", "title": "Tips", "retrieved": "2026-03-01"}]'::jsonb,
  '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_rule_sets
  WHERE jurisdiction_code = 'ZA' AND rule_type = 'tips_law' AND status = 'published'
);

UPDATE public.payroll_rule_sets
SET golden_tests = '[
  {
    "name": "uif_at_ceiling",
    "input": {"jurisdictionCode": "ZA", "periodGross": 20000, "statutoryMode": "auto"},
    "expected": [{"code": "uif_employee", "amount": 177.12, "tolerance": 0.05}]
  }
]'::jsonb
WHERE jurisdiction_code = 'ZA'
  AND rule_type = 'social_contributions'
  AND status = 'published'
  AND golden_tests = '[]'::jsonb;
