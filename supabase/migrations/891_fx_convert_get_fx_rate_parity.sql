-- 891: Ledger convert uses get_fx_rate (hold, inverse, ZAR pivot parity with Apple/checkout lookups).

BEGIN;

CREATE OR REPLACE FUNCTION public.convert_to_reporting_amount(
  p_raw_amount numeric,
  p_raw_currency text,
  p_reporting_currency text,
  p_rate_date date DEFAULT CURRENT_DATE
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw text := upper(trim(coalesce(p_raw_currency, 'ZAR')));
  v_reporting text := upper(trim(coalesce(p_reporting_currency, 'ZAR')));
  v_rate numeric;
  v_at timestamptz := (p_rate_date::text || 'T12:00:00Z')::timestamptz;
BEGIN
  IF p_raw_amount IS NULL THEN RETURN NULL; END IF;
  IF v_raw = v_reporting THEN RETURN p_raw_amount; END IF;

  v_rate := public.get_fx_rate(v_raw, v_reporting, v_at);

  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'missing_fx_rate:%->% on %', v_raw, v_reporting, p_rate_date;
  END IF;

  RETURN round(p_raw_amount * v_rate, 4);
END;
$$;

COMMENT ON FUNCTION public.convert_to_reporting_amount IS
  'Convert raw ledger amount to reporting currency via get_fx_rate (reporting only).';

GRANT EXECUTE ON FUNCTION public.convert_to_reporting_amount(numeric, text, text, date)
  TO authenticated, service_role;

COMMIT;
