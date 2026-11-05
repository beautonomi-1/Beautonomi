-- ZA payroll rule sets for the 2027 year of assessment (1 March 2026 – 28 February 2027).
--
-- 940/942 seeded rows effective 2026-03-01 with the previous year's figures:
--   * income_tax: 2026 tax-year brackets/rebates (and tertiary rebate 29 877 instead of 29 824).
--   * minimum_wage: R28,79/h (NMW from 1 March 2025).
-- Sources:
--   SARS Guide for Employers in respect of Employees' Tax (2027), Budget 25 February 2026.
--   National Minimum Wage Amendment 2026, GN R.7083, GG 54075 (3 February 2026), binding 1 March 2026.
-- Rebates are stored cumulatively (secondary = primary + secondary, tertiary = primary + secondary + tertiary),
-- matching the za pack: R17 820 / R9 765 / R3 249 -> 17 820 / 27 585 / 30 834.
-- UIF (1%, R17 712/month ceiling) and SDL (1%, R500 000 threshold) are unchanged.

BEGIN;

UPDATE public.payroll_rule_sets
SET status = 'retired'
WHERE jurisdiction_code = 'ZA'
  AND rule_type = 'income_tax'
  AND status = 'published'
  AND (data -> 'rebates' ->> 'primary')::numeric <> 17820;

INSERT INTO public.payroll_rule_sets (
  jurisdiction_code, rule_type, effective_from, status, data, sources, golden_tests, published_at
)
SELECT
  'ZA',
  'income_tax',
  '2026-03-01'::date,
  'published',
  '{
    "payPeriodsPerYear": 12,
    "rebates": {"primary": 17820, "secondary": 27585, "tertiary": 30834},
    "brackets": [
      {"upTo": 245100, "rate": 18, "base": 0},
      {"upTo": 383100, "rate": 26, "base": 44118},
      {"upTo": 530200, "rate": 31, "base": 79998},
      {"upTo": 695800, "rate": 36, "base": 125599},
      {"upTo": 887000, "rate": 39, "base": 185215},
      {"upTo": 1878600, "rate": 41, "base": 259783},
      {"upTo": null, "rate": 45, "base": 666339}
    ]
  }'::jsonb,
  '[
    {"url": "https://www.sars.gov.za/guide-for-employers-in-respect-of-employees-tax-2027/", "title": "SARS Guide for Employers in respect of Employees'' Tax (2027)", "retrieved": "2026-11-04"},
    {"url": "https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/", "title": "SARS Rates of Tax for Individuals", "retrieved": "2026-11-04"}
  ]'::jsonb,
  '[
    {"name": "monthly_30000_under_65", "input": {"jurisdictionCode": "ZA", "periodGross": 30000, "statutoryMode": "auto", "ageYears": 30},
     "expected": [{"code": "paye_estimate", "amount": 4681.00, "tolerance": 0.02}, {"code": "uif_employee", "amount": 177.12, "tolerance": 0.02}]},
    {"name": "monthly_30000_age_70", "input": {"jurisdictionCode": "ZA", "periodGross": 30000, "statutoryMode": "auto", "ageYears": 70},
     "expected": [{"code": "paye_estimate", "amount": 3867.25, "tolerance": 0.02}]},
    {"name": "monthly_100000_under_65", "input": {"jurisdictionCode": "ZA", "periodGross": 100000, "statutoryMode": "auto", "ageYears": 40},
     "expected": [{"code": "paye_estimate", "amount": 30857.75, "tolerance": 0.02}]}
  ]'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_rule_sets
  WHERE jurisdiction_code = 'ZA' AND rule_type = 'income_tax' AND status = 'published'
);

UPDATE public.payroll_rule_sets
SET status = 'retired'
WHERE jurisdiction_code = 'ZA'
  AND rule_type = 'minimum_wage'
  AND status = 'published'
  AND (data ->> 'hourlyRate')::numeric <> 30.23;

INSERT INTO public.payroll_rule_sets (
  jurisdiction_code, rule_type, effective_from, status, data, sources, golden_tests, published_at
)
SELECT
  'ZA',
  'minimum_wage',
  '2026-03-01'::date,
  'published',
  '{"hourlyRate": 30.23, "currency": "ZAR"}'::jsonb,
  '[{"url": "https://www.gov.za/sites/default/files/gcis_document/202602/54075rg11941gon7083.pdf", "title": "National Minimum Wage Amendment 2026 (GN R.7083)", "retrieved": "2026-11-04"}]'::jsonb,
  '[]'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_rule_sets
  WHERE jurisdiction_code = 'ZA' AND rule_type = 'minimum_wage' AND status = 'published'
);

COMMIT;
