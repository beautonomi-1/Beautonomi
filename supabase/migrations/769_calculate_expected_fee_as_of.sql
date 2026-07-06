-- 769: Historical fee config lookup for reconciliation backfill.
-- Adds optional as_of_date_param to calculate_expected_fee so backfill uses
-- rates effective on the reconciliation date, not NOW().
--
-- NOTE: adding a 7th parameter creates a NEW overload rather than replacing the
-- existing 6-arg function. Drop the old signature first so 6-arg named-param
-- callers do not hit "function is not unique" ambiguity (the 7-arg version is
-- backward compatible via as_of_date_param DEFAULT NULL).
DROP FUNCTION IF EXISTS public.calculate_expected_fee(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.calculate_expected_fee(
  gateway_name_param   TEXT,
  transaction_amount   NUMERIC,
  currency_param       TEXT    DEFAULT 'ZAR',
  payment_method_param TEXT    DEFAULT '*',
  region_param         TEXT    DEFAULT 'local',
  fee_scope_param      TEXT    DEFAULT 'transaction',
  as_of_date_param     DATE    DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  cfg            RECORD;
  base_fee       NUMERIC := 0;
  fixed          NUMERIC := 0;
  computed_fee   NUMERIC := 0;
  effective_as_of TIMESTAMPTZ;
BEGIN
  effective_as_of := COALESCE(as_of_date_param::timestamptz, NOW());

  SELECT * INTO cfg
  FROM public.payment_gateway_fee_configs
  WHERE gateway_name = gateway_name_param
    AND currency      = currency_param
    AND fee_scope     = fee_scope_param
    AND is_active     = true
    AND (effective_until IS NULL OR effective_until > effective_as_of)
    AND effective_from <= effective_as_of
    AND (payment_method = payment_method_param OR payment_method = '*')
    AND (region         = region_param         OR region         = '*')
  ORDER BY
    (CASE WHEN payment_method = payment_method_param THEN 0 ELSE 1 END),
    (CASE WHEN region         = region_param         THEN 0 ELSE 1 END),
    effective_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  base_fee := transaction_amount * COALESCE(cfg.fee_percentage, 0);

  IF cfg.fixed_fee_waiver_below IS NULL OR transaction_amount >= cfg.fixed_fee_waiver_below THEN
    fixed := COALESCE(cfg.fee_fixed_amount, 0);
  END IF;

  computed_fee := base_fee + fixed;

  IF cfg.max_fee_amount IS NOT NULL THEN
    computed_fee := LEAST(computed_fee, cfg.max_fee_amount);
  END IF;

  IF cfg.fee_is_vat_exclusive AND cfg.vat_rate > 0 THEN
    computed_fee := computed_fee * (1 + cfg.vat_rate);
  END IF;

  RETURN ROUND(computed_fee, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.calculate_expected_fee(TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, DATE) IS
  'Compute expected gateway fee from active config. Pass as_of_date_param for historical reconciliation.';
