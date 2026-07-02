-- 733: Extend ledger_platform_revenue to include subscription/ads/marketing
--      accounts 3100, 3300, 3400 and the deferred revenue liabilities
--      (2810, 2820, 2830) so the GL P&L = canonical platform revenue.
--
-- Also updates the grant for the trial-balance view to allow service_role
-- access for the new trial-balance API endpoint.

BEGIN;

-- ─── Extended ledger_platform_revenue ─────────────────────────────────────────
-- The prior version returned a narrower TABLE shape. Postgres cannot change the
-- OUT/return type of an existing function via CREATE OR REPLACE, so drop it first.
DROP FUNCTION IF EXISTS public.ledger_platform_revenue(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.ledger_platform_revenue(
  p_from timestamptz DEFAULT '-infinity'::timestamptz,
  p_to   timestamptz DEFAULT 'infinity'::timestamptz
)
RETURNS TABLE (
  gross_payments          numeric,
  platform_fees           numeric,
  subscription_revenue    numeric,
  ads_revenue             numeric,
  marketing_credit_revenue numeric,
  gateway_fees            numeric,
  refunds                 numeric,
  provider_payable        numeric,
  tax_payable             numeric,
  tips_payable            numeric,
  deferred_subscription   numeric,
  deferred_ads            numeric,
  deferred_marketing      numeric,
  net_recognized_revenue  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH lines AS (
    SELECT ga.code AS account_code, jl.side, jl.reporting_amount
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.entry_id
    JOIN public.gl_accounts ga     ON ga.id = jl.account_id
    WHERE je.posted_at  >= p_from
      AND je.posted_at   < p_to
  )
  SELECT
    -- Cash collected (gross inflows)
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '1000' AND side = 'debit'),  0)::numeric
      AS gross_payments,
    -- Platform revenue accounts (recognized)
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3000' AND side = 'credit'), 0)::numeric
      AS platform_fees,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3100' AND side = 'credit'), 0)::numeric
      AS subscription_revenue,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3300' AND side = 'credit'), 0)::numeric
      AS ads_revenue,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3400' AND side = 'credit'), 0)::numeric
      AS marketing_credit_revenue,
    -- Cost / contra accounts
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '4000' AND side = 'debit'),  0)::numeric
      AS gateway_fees,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '4100' AND side = 'debit'),  0)::numeric
      AS refunds,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2000' AND side = 'credit'), 0)::numeric
      AS provider_payable,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2100' AND side = 'credit'), 0)::numeric
      AS tax_payable,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2200' AND side = 'credit'), 0)::numeric
      AS tips_payable,
    -- Deferred revenue liabilities (net credit = unearned)
    (COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2810' AND side = 'credit'), 0)
   - COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2810' AND side = 'debit'),  0))::numeric
      AS deferred_subscription,
    (COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2820' AND side = 'credit'), 0)
   - COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2820' AND side = 'debit'),  0))::numeric
      AS deferred_ads,
    (COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2830' AND side = 'credit'), 0)
   - COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2830' AND side = 'debit'),  0))::numeric
      AS deferred_marketing,
    -- Net recognized revenue = all recognized revenue − gateway fees − refunds
    (
      COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3000' AND side = 'credit'), 0)
    + COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3100' AND side = 'credit'), 0)
    + COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3300' AND side = 'credit'), 0)
    + COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3400' AND side = 'credit'), 0)
    - COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '4000' AND side = 'debit'),  0)
    - COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '4100' AND side = 'debit'),  0)
    )::numeric AS net_recognized_revenue
  FROM lines;
$$;

GRANT EXECUTE ON FUNCTION public.ledger_platform_revenue(timestamptz, timestamptz)
  TO service_role;

-- ─── Grant v_ledger_account_balances to service_role for trial-balance API ────
GRANT SELECT ON public.v_ledger_account_balances TO service_role;
GRANT SELECT ON public.v_journal_entry_totals    TO service_role;
GRANT SELECT ON public.gl_accounts               TO service_role;
GRANT SELECT ON public.journal_entries           TO service_role;
GRANT SELECT ON public.journal_lines             TO service_role;

COMMIT;
