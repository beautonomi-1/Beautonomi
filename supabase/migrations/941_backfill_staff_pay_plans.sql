-- Idempotent backfill: one active pay plan per staff from legacy columns.
INSERT INTO public.staff_pay_plans (
  staff_id,
  provider_id,
  effective_from,
  pay_model,
  employment_type,
  base_amount,
  hourly_rate,
  service_rate,
  product_rate,
  tier_mode,
  tiers
)
SELECT
  ps.id,
  ps.provider_id,
  COALESCE(ps.employment_start_date, (ps.created_at AT TIME ZONE 'UTC')::date),
  CASE
    WHEN COALESCE(ps.salary, 0) > 0 AND COALESCE(ps.commission_enabled, true) = false THEN 'salary'
    WHEN COALESCE(ps.hourly_rate, 0) > 0 AND COALESCE(ps.commission_enabled, true) = true THEN 'hourly_plus_commission'
    WHEN COALESCE(ps.hourly_rate, 0) > 0 THEN 'hourly'
    ELSE 'commission_only'
  END,
  'employee',
  NULLIF(ps.salary, 0),
  NULLIF(ps.hourly_rate, 0),
  COALESCE(ps.service_commission_rate, 0),
  COALESCE(ps.product_commission_rate, 0),
  'retroactive',
  '[]'::jsonb
FROM public.provider_staff ps
WHERE ps.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_pay_plans spp WHERE spp.staff_id = ps.id
  );
