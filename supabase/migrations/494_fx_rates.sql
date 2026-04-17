-- F18 — FX rates table + get_fx_rate helper.
--
-- Motivation: today every currency figure in the ledger is recorded in the
-- transaction currency, but reporting aggregates (admin revenue, provider
-- earnings) compute "reporting currency" totals as if 1 currency unit == 1
-- reporting unit. This is only correct when the platform operates in a single
-- currency. F18 introduces:
--
--   1. public.fx_rates:
--       • One row per (base, quote, as_of) giving the FX rate to convert
--         base -> quote on a given day.
--       • `source` records the provider (paystack, yoco, manual, openexchangerates).
--   2. public.get_fx_rate(base, quote, at) SQL helper that returns the rate
--      effective at `at`, or 1.0 if base == quote, or NULL if no row is found.
--
-- Writers (fx-refresh cron / admin UI) are free to insert multiple rows for
-- the same day (different sources); get_fx_rate picks the latest.

CREATE TABLE IF NOT EXISTS public.fx_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base        text NOT NULL CHECK (length(base) = 3),
  quote       text NOT NULL CHECK (length(quote) = 3),
  rate        numeric(18, 8) NOT NULL CHECK (rate > 0),
  as_of       timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL DEFAULT 'manual',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_rates_different_currencies CHECK (base <> quote)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup
  ON public.fx_rates (base, quote, as_of DESC);

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_rates_read_all ON public.fx_rates;
CREATE POLICY fx_rates_read_all ON public.fx_rates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fx_rates_write_admin ON public.fx_rates;
CREATE POLICY fx_rates_write_admin ON public.fx_rates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'admin_finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'admin_finance')
    )
  );

CREATE OR REPLACE FUNCTION public.get_fx_rate(
  p_base  text,
  p_quote text,
  p_at    timestamptz DEFAULT now()
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_base = p_quote THEN 1.0::numeric
    ELSE (
      SELECT rate FROM public.fx_rates
      WHERE base = p_base AND quote = p_quote AND as_of <= p_at
      ORDER BY as_of DESC
      LIMIT 1
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fx_rate(text, text, timestamptz)
  TO authenticated, service_role;

COMMENT ON TABLE public.fx_rates IS 'F18: FX rates for cross-currency reporting. See get_fx_rate().';
COMMENT ON FUNCTION public.get_fx_rate IS
  'F18: returns the latest rate to convert p_base -> p_quote at p_at, or 1.0 when currencies match.';
