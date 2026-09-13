-- 890: Unified FX lookup on fx_reference_rates (Frankfurter v2 + manual holds).
-- get_fx_rate reads fx_reference_rates first (manual preference, inverse, ZAR pivot), then legacy fx_rates.

BEGIN;

ALTER TABLE public.fx_reference_rates
  ADD COLUMN IF NOT EXISTS hold_until date,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS set_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fx_reference_rates.hold_until IS
  'When set on manual rows, this rate wins over newer API rows until this date (inclusive).';
COMMENT ON COLUMN public.fx_reference_rates.note IS 'Finance override reason (manual rows only).';
COMMENT ON COLUMN public.fx_reference_rates.set_by IS 'Admin user who posted a manual override.';

-- Resolve one stored pair (base->quote) at p_at with hold + same-day manual preference.
CREATE OR REPLACE FUNCTION public.resolve_fx_reference_rate(
  p_base text,
  p_quote text,
  p_at timestamptz DEFAULT now()
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base text := upper(trim(p_base));
  v_quote text := upper(trim(p_quote));
  v_at_date date := (p_at AT TIME ZONE 'UTC')::date;
  v_rate numeric;
  v_hold_rate numeric;
  v_best_date date;
BEGIN
  IF v_base = v_quote THEN
    RETURN 1.0;
  END IF;

  -- Active manual hold (latest qualifying row)
  SELECT fr.rate INTO v_hold_rate
  FROM public.fx_reference_rates fr
  WHERE fr.base_currency = v_base
    AND fr.quote_currency = v_quote
    AND fr.source = 'manual'
    AND fr.hold_until IS NOT NULL
    AND fr.hold_until >= v_at_date
    AND fr.rate_date <= v_at_date
  ORDER BY fr.rate_date DESC, fr.fetched_at DESC
  LIMIT 1;

  IF v_hold_rate IS NOT NULL THEN
    RETURN v_hold_rate;
  END IF;

  -- Newest rate_date <= as_of; prefer manual on that date
  SELECT max(fr.rate_date) INTO v_best_date
  FROM public.fx_reference_rates fr
  WHERE fr.base_currency = v_base
    AND fr.quote_currency = v_quote
    AND fr.rate_date <= v_at_date;

  IF v_best_date IS NOT NULL THEN
    SELECT fr.rate INTO v_rate
    FROM public.fx_reference_rates fr
    WHERE fr.base_currency = v_base
      AND fr.quote_currency = v_quote
      AND fr.rate_date = v_best_date
    ORDER BY CASE WHEN fr.source = 'manual' THEN 0 ELSE 1 END, fr.fetched_at DESC
    LIMIT 1;

    IF v_rate IS NOT NULL THEN
      RETURN v_rate;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_fx_rate(
  p_base  text,
  p_quote text,
  p_at    timestamptz DEFAULT now()
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base text := upper(trim(p_base));
  v_quote text := upper(trim(p_quote));
  v_rate numeric;
  v_inv numeric;
  v_leg_base numeric;
  v_leg_quote numeric;
BEGIN
  IF v_base = v_quote THEN
    RETURN 1.0;
  END IF;

  v_rate := public.resolve_fx_reference_rate(v_base, v_quote, p_at);
  IF v_rate IS NOT NULL THEN
    RETURN v_rate;
  END IF;

  -- Inverse: quote->base
  v_inv := public.resolve_fx_reference_rate(v_quote, v_base, p_at);
  IF v_inv IS NOT NULL AND v_inv <> 0 THEN
    RETURN round(1.0 / v_inv, 8);
  END IF;

  -- ZAR pivot: base->quote via base->ZAR and quote->ZAR
  IF v_quote = 'ZAR' THEN
    v_leg_base := public.resolve_fx_reference_rate(v_base, 'ZAR', p_at);
    IF v_leg_base IS NOT NULL THEN
      RETURN v_leg_base;
    END IF;
  ELSIF v_base = 'ZAR' THEN
    v_leg_quote := public.resolve_fx_reference_rate(v_quote, 'ZAR', p_at);
    IF v_leg_quote IS NOT NULL AND v_leg_quote <> 0 THEN
      RETURN round(1.0 / v_leg_quote, 8);
    END IF;
  ELSE
    v_leg_base := public.resolve_fx_reference_rate(v_base, 'ZAR', p_at);
    v_leg_quote := public.resolve_fx_reference_rate(v_quote, 'ZAR', p_at);
    IF v_leg_base IS NOT NULL AND v_leg_quote IS NOT NULL AND v_leg_quote <> 0 THEN
      RETURN round(v_leg_base / v_leg_quote, 8);
    END IF;
  END IF;

  -- Legacy fx_rates table
  SELECT fr.rate INTO v_rate
  FROM public.fx_rates fr
  WHERE fr.base = v_base
    AND fr.quote = v_quote
    AND fr.as_of <= p_at
  ORDER BY fr.as_of DESC
  LIMIT 1;

  IF v_rate IS NOT NULL THEN
    RETURN v_rate;
  END IF;

  SELECT fr.rate INTO v_inv
  FROM public.fx_rates fr
  WHERE fr.base = v_quote
    AND fr.quote = v_base
    AND fr.as_of <= p_at
  ORDER BY fr.as_of DESC
  LIMIT 1;

  IF v_inv IS NOT NULL AND v_inv <> 0 THEN
    RETURN round(1.0 / v_inv, 8);
  END IF;

  RETURN NULL;
END;
$$;

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

  v_rate := public.resolve_fx_reference_rate(v_raw, v_reporting, v_at);

  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'missing_fx_rate:%->% on %', v_raw, v_reporting, p_rate_date;
  END IF;

  RETURN round(p_raw_amount * v_rate, 4);
END;
$$;

COMMENT ON FUNCTION public.resolve_fx_reference_rate IS
  'Direct fx_reference_rates lookup with manual hold and same-day manual preference.';
COMMENT ON FUNCTION public.get_fx_rate IS
  'HQ reporting rate: fx_reference_rates (hold, inverse, ZAR pivot) then legacy fx_rates.';
COMMENT ON FUNCTION public.convert_to_reporting_amount IS
  'Convert raw ledger amount to reporting currency via fx_reference_rates (reporting only).';

GRANT EXECUTE ON FUNCTION public.resolve_fx_reference_rate(text, text, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_fx_rate(text, text, timestamptz)
  TO authenticated, service_role;

COMMIT;
