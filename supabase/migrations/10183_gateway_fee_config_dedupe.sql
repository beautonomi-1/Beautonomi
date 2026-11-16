-- Deactivate exact duplicate active fee configs, keeping the oldest row,
-- and stop new duplicates.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY gateway_name, payment_method, currency, region, fee_scope, effective_from
           ORDER BY id ASC
         ) AS n
  FROM public.payment_gateway_fee_configs
  WHERE is_active
)
UPDATE public.payment_gateway_fee_configs cfg
SET is_active = false
FROM ranked
WHERE cfg.id = ranked.id
  AND ranked.n > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_gateway_fee_config_active
  ON public.payment_gateway_fee_configs (
    gateway_name,
    COALESCE(payment_method, ''),
    COALESCE(currency, ''),
    COALESCE(region, ''),
    COALESCE(fee_scope, ''),
    effective_from
  )
  WHERE is_active;
