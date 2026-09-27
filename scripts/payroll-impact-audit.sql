-- Read-only audit: staff/payroll data affected by known pre-payroll_v2 issues.
-- Run in Supabase SQL editor; do NOT auto-mutate production pay runs.

-- 1) Stale commission rates (legacy column set, canonical columns zero)
SELECT 'stale_commission_rates' AS issue,
       ps.id AS staff_id,
       ps.provider_id,
       ps.name,
       ps.commission_rate,
       ps.commission_percentage,
       ps.service_commission_rate,
       ps.product_commission_rate
FROM public.provider_staff ps
WHERE ps.is_active = true
  AND ps.deleted_at IS NULL
  AND COALESCE(ps.commission_percentage, 0) > 0
  AND COALESCE(ps.service_commission_rate, 0) = 0
  AND COALESCE(ps.product_commission_rate, 0) = 0
UNION ALL
SELECT 'stale_commission_rates',
       ps.id, ps.provider_id, ps.name,
       ps.commission_rate, ps.commission_percentage,
       ps.service_commission_rate, ps.product_commission_rate
FROM public.provider_staff ps
WHERE ps.is_active = true
  AND ps.deleted_at IS NULL
  AND COALESCE(ps.commission_rate, 0) > 0
  AND ps.service_commission_rate IS NULL
  AND ps.product_commission_rate IS NULL;

-- 2) Staff with commission_enabled false but positive ledger commission lines (last 90d)
SELECT 'commission_disabled_but_lines' AS issue,
       ps.id AS staff_id,
       ps.provider_id,
       ps.name,
       COUNT(*) AS line_count,
       SUM(sel.amount) AS total_amount
FROM public.provider_staff ps
JOIN public.staff_earnings_lines sel ON sel.staff_id = ps.id
WHERE ps.commission_enabled = false
  AND sel.kind = 'commission'
  AND sel.amount > 0
  AND sel.created_at >= now() - interval '90 days'
GROUP BY ps.id, ps.provider_id, ps.name;

-- 3) Active staff never accepted invite (portal elevation risk)
SELECT 'invite_not_accepted' AS issue,
       ps.id,
       ps.provider_id,
       ps.email,
       ps.invite_accepted_at,
       ps.created_at
FROM public.provider_staff ps
WHERE ps.is_active = true
  AND ps.deleted_at IS NULL
  AND ps.user_id IS NOT NULL
  AND ps.invite_accepted_at IS NULL
  AND ps.role IS DISTINCT FROM 'owner';

-- 4) Multi-location providers: staff with zero location assignments
SELECT 'staff_zero_locations' AS issue,
       p.id AS provider_id,
       ps.id AS staff_id,
       ps.name
FROM public.providers p
JOIN public.provider_staff ps ON ps.provider_id = p.id
WHERE ps.is_active = true
  AND ps.deleted_at IS NULL
  AND (
    SELECT COUNT(*) FROM public.provider_locations pl
    WHERE pl.provider_id = p.id AND pl.is_active = true
  ) > 1
  AND NOT EXISTS (
    SELECT 1 FROM public.provider_staff_locations psl
    WHERE psl.staff_id = ps.id
  );

-- 5) Duplicate time clock PINs within same provider (clock-in .single() failure)
SELECT 'duplicate_time_clock_pin' AS issue,
       provider_id,
       time_clock_pin,
       COUNT(*) AS staff_count
FROM public.provider_staff
WHERE time_clock_enabled = true
  AND time_clock_pin IS NOT NULL
  AND is_active = true
  AND deleted_at IS NULL
GROUP BY provider_id, time_clock_pin
HAVING COUNT(*) > 1;
