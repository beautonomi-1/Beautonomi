-- Seed published ZA payroll rule sets (2026 tax year starter — verify against SARS before production pay).

INSERT INTO public.payroll_rule_sets (
  jurisdiction_code, rule_type, effective_from, status, data, sources, golden_tests
)
SELECT
  'ZA',
  'social_contributions',
  '2026-03-01'::date,
  'published',
  '{"uifRateEmployee": 0.01, "uifCeiling": 17712}'::jsonb,
  '[{"url": "https://www.uif.gov.za/", "title": "UIF", "retrieved": "2026-03-01"}]'::jsonb,
  '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_rule_sets
  WHERE jurisdiction_code = 'ZA' AND rule_type = 'social_contributions' AND status = 'published'
);

INSERT INTO public.payroll_rule_sets (
  jurisdiction_code, rule_type, effective_from, status, data, sources, golden_tests
)
SELECT
  'ZA',
  'employer_levies',
  '2026-03-01'::date,
  'published',
  '{"rate": 0.01, "annualThreshold": 500000}'::jsonb,
  '[{"url": "https://www.sars.gov.za/", "title": "SDL", "retrieved": "2026-03-01"}]'::jsonb,
  '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_rule_sets
  WHERE jurisdiction_code = 'ZA' AND rule_type = 'employer_levies' AND status = 'published'
);

INSERT INTO public.payroll_rule_sets (
  jurisdiction_code, rule_type, effective_from, status, data, sources, golden_tests
)
SELECT
  'ZA',
  'income_tax',
  '2026-03-01'::date,
  'published',
  '{
    "payPeriodsPerYear": 12,
    "rebates": {"primary": 17235, "secondary": 26679, "tertiary": 29877},
    "brackets": [
      {"upTo": 237100, "rate": 18, "base": 0},
      {"upTo": 370500, "rate": 26, "base": 42678},
      {"upTo": 512800, "rate": 31, "base": 77362},
      {"upTo": 673000, "rate": 36, "base": 121475},
      {"upTo": 857900, "rate": 39, "base": 179147},
      {"upTo": 1817000, "rate": 41, "base": 251258},
      {"upTo": null, "rate": 45, "base": 644489}
    ]
  }'::jsonb,
  '[{"url": "https://www.sars.gov.za/", "title": "PAYE tables", "retrieved": "2026-03-01"}]'::jsonb,
  '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_rule_sets
  WHERE jurisdiction_code = 'ZA' AND rule_type = 'income_tax' AND status = 'published'
);
