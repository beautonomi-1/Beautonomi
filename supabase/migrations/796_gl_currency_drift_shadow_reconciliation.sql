-- Phase 3 (multi-currency): per-currency GL drift shadow reconciliation.
--
-- In the single-currency-per-region model every journal_entry is posted in one
-- raw_currency and must balance in BOTH raw and reporting terms. This view rolls
-- up journal_lines per (tenant, raw_currency) so finance ops can detect drift —
-- e.g. an FX conversion that only balanced in reporting currency, or a stray
-- cross-currency posting. Any row where raw_drift <> 0 is an exception.

CREATE OR REPLACE VIEW public.v_gl_currency_drift AS
SELECT
  je.tenant_id,
  jl.raw_currency,
  jl.reporting_currency,
  COUNT(DISTINCT je.id)                                                        AS entry_count,
  COALESCE(SUM(jl.raw_amount) FILTER (WHERE jl.side = 'debit'),  0)            AS raw_debits,
  COALESCE(SUM(jl.raw_amount) FILTER (WHERE jl.side = 'credit'), 0)            AS raw_credits,
  COALESCE(SUM(jl.raw_amount) FILTER (WHERE jl.side = 'debit'),  0)
    - COALESCE(SUM(jl.raw_amount) FILTER (WHERE jl.side = 'credit'), 0)        AS raw_drift,
  COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'debit'),  0)      AS reporting_debits,
  COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'credit'), 0)      AS reporting_credits,
  COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'debit'),  0)
    - COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'credit'), 0)  AS reporting_drift,
  MAX(je.posted_at)                                                           AS last_posted_at
FROM public.journal_lines jl
INNER JOIN public.journal_entries je ON je.id = jl.entry_id
WHERE jl.raw_currency IS NOT NULL
GROUP BY je.tenant_id, jl.raw_currency, jl.reporting_currency;

COMMENT ON VIEW public.v_gl_currency_drift IS
  'P3 multi-currency: per-(tenant, raw_currency) debit/credit rollup. raw_drift <> 0 means the ledger is unbalanced in that currency (FX mishandling / stray cross-currency posting).';

-- Convenience function: rows exceeding a minor-unit tolerance (default 1 cent).
CREATE OR REPLACE FUNCTION public.gl_currency_drift_exceptions(p_tolerance numeric DEFAULT 0.01)
RETURNS TABLE (
  tenant_id uuid,
  raw_currency text,
  reporting_currency text,
  entry_count bigint,
  raw_drift numeric,
  reporting_drift numeric,
  last_posted_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.tenant_id,
    d.raw_currency,
    d.reporting_currency,
    d.entry_count,
    d.raw_drift,
    d.reporting_drift,
    d.last_posted_at
  FROM public.v_gl_currency_drift d
  WHERE ABS(d.raw_drift) > p_tolerance
     OR ABS(d.reporting_drift) > p_tolerance;
$$;

COMMENT ON FUNCTION public.gl_currency_drift_exceptions(numeric) IS
  'P3: returns per-currency GL rollups whose raw/reporting drift exceeds tolerance. Feeds the shadow reconciliation cron.';
