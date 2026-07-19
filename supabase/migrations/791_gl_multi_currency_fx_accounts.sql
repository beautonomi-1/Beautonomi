-- Phase 3: Multi-currency GL — FX gain/loss accounts + configurable reporting currency per tenant.

INSERT INTO public.gl_accounts (code, name, type, normal_side, is_active)
VALUES
  ('4900', 'Realised FX gain/loss', 'expense', 'debit', true),
  ('4910', 'Unrealised FX gain/loss', 'expense', 'debit', true),
  ('1950', 'FX clearing', 'asset', 'debit', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  normal_side = EXCLUDED.normal_side,
  is_active = true;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS reporting_currency TEXT;

UPDATE public.tenants
SET reporting_currency = COALESCE(default_currency, 'ZAR')
WHERE reporting_currency IS NULL;

COMMENT ON COLUMN public.tenants.reporting_currency IS
  'Consolidation/reporting currency for GL shadow entries (functional currency per legal entity).';

-- Enforce single raw_currency per journal entry at application layer; index for reconciliation.
CREATE INDEX IF NOT EXISTS idx_journal_lines_raw_currency
  ON public.journal_lines (raw_currency)
  WHERE raw_currency IS NOT NULL;
