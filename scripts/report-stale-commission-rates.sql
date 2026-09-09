-- Staff whose mobile "Team commissions" screen wrote commission_percentage
-- but payroll reads service_commission_rate / product_commission_rate.
-- Review per provider before changing pay runs; do not auto-backfill.

SELECT
  ps.id AS staff_id,
  ps.provider_id,
  p.business_name AS provider_name,
  ps.name AS staff_name,
  ps.commission_percentage,
  ps.service_commission_rate,
  ps.product_commission_rate,
  ps.commission_rate
FROM public.provider_staff ps
JOIN public.providers p ON p.id = ps.provider_id
WHERE ps.is_active = true
  AND ps.deleted_at IS NULL
  AND COALESCE(ps.commission_percentage, 0) > 0
  AND COALESCE(ps.service_commission_rate, 0) = 0
  AND COALESCE(ps.product_commission_rate, 0) = 0
ORDER BY p.business_name, ps.name;
