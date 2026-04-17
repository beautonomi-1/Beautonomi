-- F17 — Dedicated tax_rates table + booking_services.tax_snapshot.
--
-- Today tax is resolved per-booking from:
--  * providers.tax_rate_percent (nullable)
--  * platform_settings.settings->'taxes'
--  * reference_data (type='tax_rate')
--
-- That means there is no single source of truth for "what was the VAT rate
-- when this booking was captured?" — a VAT-rate change would retroactively
-- alter reporting. This migration introduces:
--
--   1. public.tax_rates: one row per jurisdiction + code + rate, with
--      validity window and an "is_platform_default" flag.
--   2. public.booking_services.tax_snapshot jsonb: the resolved
--      {code, rate, inclusive, jurisdiction, source} captured at booking
--      creation so historical reporting is immutable.
--   3. public.resolve_tax_rate(p_provider_id, p_at) SQL helper: returns the
--      tax_rate row that should apply for a provider at a given time.

CREATE TABLE IF NOT EXISTS public.tax_rates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text NOT NULL,
  name                text NOT NULL,
  jurisdiction        text NOT NULL,
  country_code        text,
  rate                numeric(6, 3) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  inclusive           boolean NOT NULL DEFAULT false,
  is_platform_default boolean NOT NULL DEFAULT false,
  effective_from      timestamptz NOT NULL DEFAULT now(),
  effective_to        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_rates_window CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_rates_code_window_active
  ON public.tax_rates (jurisdiction, code)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_tax_rates_default_active
  ON public.tax_rates (is_platform_default, effective_from DESC)
  WHERE is_platform_default = true AND effective_to IS NULL;

ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_rates_read_all ON public.tax_rates;
CREATE POLICY tax_rates_read_all ON public.tax_rates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tax_rates_write_admin ON public.tax_rates;
CREATE POLICY tax_rates_write_admin ON public.tax_rates
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

-- ─── booking_services.tax_snapshot ────────────────────────────────────────────

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS tax_snapshot jsonb;

COMMENT ON COLUMN public.booking_services.tax_snapshot IS
  'F17: { code, rate, inclusive, jurisdiction, source, resolved_at } captured at booking creation. Historical reporting reads this column.';

-- ─── resolve_tax_rate helper ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_tax_rate(
  p_provider_id uuid,
  p_at          timestamptz DEFAULT now()
)
RETURNS public.tax_rates
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.tax_rates;
  v_provider_rate numeric;
  v_provider_inclusive boolean;
  v_country text;
BEGIN
  SELECT tax_rate_percent, COALESCE(tax_inclusive, false), country_code
    INTO v_provider_rate, v_provider_inclusive, v_country
  FROM public.providers
  WHERE id = p_provider_id;

  IF v_provider_rate IS NOT NULL THEN
    -- Synthesise a pseudo-row matching the provider override.
    v_row.id := NULL;
    v_row.code := 'PROVIDER_OVERRIDE';
    v_row.name := 'Provider override';
    v_row.jurisdiction := COALESCE(v_country, 'UNKNOWN');
    v_row.country_code := v_country;
    v_row.rate := v_provider_rate;
    v_row.inclusive := v_provider_inclusive;
    v_row.is_platform_default := false;
    v_row.effective_from := p_at;
    RETURN v_row;
  END IF;

  SELECT * INTO v_row
  FROM public.tax_rates
  WHERE is_platform_default = true
    AND effective_from <= p_at
    AND (effective_to IS NULL OR effective_to > p_at)
    AND (v_country IS NULL OR country_code IS NULL OR country_code = v_country)
  ORDER BY effective_from DESC
  LIMIT 1;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tax_rate(uuid, timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_tax_rate IS
  'F17: returns the tax_rates row (or synthesised provider override row) that applies for a provider at a given time.';

-- ─── seed current platform default if one exists in platform_settings ────────

DO $$
DECLARE
  v_rate numeric;
BEGIN
  SELECT ((settings -> 'taxes' ->> 'default_tax_rate')::numeric)
    INTO v_rate
  FROM public.platform_settings
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_rate IS NOT NULL AND v_rate >= 0 THEN
    INSERT INTO public.tax_rates
      (code, name, jurisdiction, country_code, rate, inclusive, is_platform_default)
    VALUES
      ('PLATFORM_DEFAULT', 'Platform default', 'GLOBAL', NULL, v_rate, false, true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
