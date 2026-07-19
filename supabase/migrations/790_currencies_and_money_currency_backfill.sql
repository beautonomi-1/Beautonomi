-- Phase 1: currencies reference table + money-table currency backfill (ZAR default).

CREATE TABLE IF NOT EXISTS public.currencies (
  code TEXT PRIMARY KEY,
  minor_units SMALLINT NOT NULL CHECK (minor_units >= 0 AND minor_units <= 4),
  symbol TEXT,
  name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.currencies (code, minor_units, symbol, name) VALUES
  ('ZAR', 2, 'R', 'South African Rand'),
  ('NGN', 2, '₦', 'Nigerian Naira'),
  ('GHS', 2, 'GH₵', 'Ghanaian Cedi'),
  ('KES', 2, 'KSh', 'Kenyan Shilling'),
  ('XOF', 0, 'CFA', 'West African CFA Franc'),
  ('GBP', 2, '£', 'British Pound'),
  ('EUR', 2, '€', 'Euro'),
  ('USD', 2, '$', 'US Dollar')
ON CONFLICT (code) DO UPDATE SET
  minor_units = EXCLUDED.minor_units,
  symbol = EXCLUDED.symbol,
  name = EXCLUDED.name;

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS currency TEXT;

ALTER TABLE public.booking_payments
  ADD COLUMN IF NOT EXISTS currency TEXT;

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE public.wallet_transactions wt
SET currency = COALESCE(t.default_currency, 'ZAR')
FROM public.tenants t
WHERE wt.currency IS NULL AND wt.tenant_id = t.id;

UPDATE public.wallet_transactions SET currency = 'ZAR' WHERE currency IS NULL;

UPDATE public.booking_payments bp
SET currency = COALESCE(t.default_currency, 'ZAR')
FROM public.tenants t
WHERE bp.currency IS NULL AND bp.tenant_id = t.id;

UPDATE public.booking_payments SET currency = 'ZAR' WHERE currency IS NULL;

-- payouts has no tenant_id; derive currency via provider -> tenant.
-- (payouts.currency is NOT NULL DEFAULT 'ZAR', so this only corrects any
--  non-ZAR tenants once they exist; legacy ZAR rows are already populated.)
UPDATE public.payouts p
SET currency = COALESCE(t.default_currency, 'ZAR')
FROM public.providers pr
JOIN public.tenants t ON t.id = pr.tenant_id
WHERE p.provider_id = pr.id
  AND (p.currency IS NULL OR p.currency = 'ZAR')
  AND t.default_currency IS NOT NULL
  AND t.default_currency <> 'ZAR';

UPDATE public.payouts SET currency = 'ZAR' WHERE currency IS NULL;

UPDATE public.finance_transactions SET currency = 'ZAR' WHERE currency IS NULL;
UPDATE public.payment_transactions SET currency = 'ZAR' WHERE currency IS NULL;

-- Daily FX reference rates (Frankfurter / ECB — reporting only, not customer charging).
CREATE TABLE IF NOT EXISTS public.fx_reference_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date DATE NOT NULL,
  base_currency TEXT NOT NULL REFERENCES public.currencies(code),
  quote_currency TEXT NOT NULL REFERENCES public.currencies(code),
  rate NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  source TEXT NOT NULL DEFAULT 'frankfurter',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rate_date, base_currency, quote_currency, source)
);

CREATE INDEX IF NOT EXISTS idx_fx_reference_rates_pair_date
  ON public.fx_reference_rates (base_currency, quote_currency, rate_date DESC);

ALTER TABLE public.fx_reference_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY fx_reference_rates_service_role
  ON public.fx_reference_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.fx_reference_rates IS
  'Daily ECB-backed reference rates for reporting/FX gain-loss only. PSP settlement rate is authoritative for reconciliation.';
