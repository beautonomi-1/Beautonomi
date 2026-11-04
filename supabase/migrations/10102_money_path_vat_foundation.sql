-- Money path: VAT foundation (rates, provider overrides, booking snapshots, payout index, resolve_tax_rate inclusive default)

-- Per-country standard rate (ZA 15%)
INSERT INTO public.tax_rates (code, name, jurisdiction, country_code, rate, inclusive, is_platform_default, effective_from)
SELECT 'ZA_STANDARD', 'South Africa VAT', 'ZA', 'ZA', 15.000, true, false, TIMESTAMPTZ '2020-01-01'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tax_rates
  WHERE code = 'ZA_STANDARD' AND country_code = 'ZA' AND effective_to IS NULL
);

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS tax_rate_override_percent numeric(6, 3),
  ADD COLUMN IF NOT EXISTS tax_rate_override_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS tax_rate_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS tax_rate_override_reason text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean,
  ADD COLUMN IF NOT EXISTS provider_vat_number_snapshot text;

ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean,
  ADD COLUMN IF NOT EXISTS provider_vat_number_snapshot text;

-- Provider VAT invariants (validate after impact report)
ALTER TABLE public.providers
  ADD CONSTRAINT providers_vat_registered_implies_rate_chk
  CHECK (is_vat_registered IS NOT TRUE OR tax_rate_percent IS NULL OR tax_rate_percent > 0)
  NOT VALID;

ALTER TABLE public.providers
  ADD CONSTRAINT providers_unregistered_zero_rate_chk
  CHECK (is_vat_registered IS TRUE OR COALESCE(tax_rate_percent, 0) = 0)
  NOT VALID;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_tax_rate_percent_range_chk
  CHECK (tax_rate IS NULL OR tax_rate = 0 OR (tax_rate >= 1 AND tax_rate <= 100))
  NOT VALID;

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
  SELECT tax_rate_percent, COALESCE(tax_inclusive, true), country_code
    INTO v_provider_rate, v_provider_inclusive, v_country
  FROM public.providers
  WHERE id = p_provider_id;

  IF v_provider_rate IS NOT NULL THEN
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
  ORDER BY (country_code IS NOT DISTINCT FROM v_country) DESC, effective_from DESC
  LIMIT 1;

  RETURN v_row;
END;
$$;

-- Split payout_id unique index (migration 299 applied globally)
DROP INDEX IF EXISTS public.idx_finance_transactions_payout_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transactions_payout_id_payout
  ON public.finance_transactions (payout_id)
  WHERE payout_id IS NOT NULL AND transaction_type = 'payout';

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transactions_payout_id_transfer_fee
  ON public.finance_transactions (payout_id)
  WHERE payout_id IS NOT NULL AND transaction_type = 'payout_transfer_fee';

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
VALUES
  (
    'finance.provider_vat_payout',
    'Provider VAT in payout balance',
    'Forward-only: include flagged platform-held VAT in provider payout balance',
    false,
    'finance'
  ),
  (
    'tax.provider_vat_settings_v2',
    'Provider VAT settings UI v2',
    'Guided VAT onboarding and settings screens',
    false,
    'tax'
  )
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;
