-- resolve_tax_rate read providers.country_code, which does not exist (plpgsql only
-- fails at call time). Derive the provider's country from its tenant market instead,
-- matching resolveProviderVat in apps/web/src/lib/tax/resolve-provider-vat.ts.

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
  SELECT p.tax_rate_percent,
         COALESCE(p.tax_inclusive, true),
         NULLIF(upper(left(btrim(t.region_code), 2)), '')
    INTO v_provider_rate, v_provider_inclusive, v_country
  FROM public.providers p
  LEFT JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.id = p_provider_id;

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
