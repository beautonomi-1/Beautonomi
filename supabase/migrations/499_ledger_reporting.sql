-- F14 Phase 3 — Read-side cutover helpers.
--
-- With the double-entry ledger shadow-written (migration 495) and historical
-- rows backfilled (migration 498), this migration exposes ledger-native
-- reporting primitives so application code can progressively move reads off
-- finance_transactions onto journal_entries / journal_lines without any
-- further schema churn.
--
-- What this adds:
--   1. public.v_journal_entry_totals — per-entry debits/credits/net,
--      convenient for audit trails and drill-downs.
--   2. public.v_ledger_account_balances — standing balance per GL account
--      (with optional tenant/provider/date filter via SECURITY INVOKER
--      functions below).
--   3. public.ledger_provider_revenue(p_provider_id, p_from, p_to) RPC —
--      ledger-native replacement for the provider revenue aggregates that
--      currently sum finance_transactions.
--   4. public.ledger_platform_revenue(p_from, p_to) RPC — platform-level
--      equivalent for admin finance dashboards.
--   5. public.ledger_reconciliation_summary(p_from, p_to) RPC —
--      one-shot diff between the legacy single-entry view and the
--      new double-entry ledger. Safe to run in CI / nightly cron.

-- ─── Entry totals view ───────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_journal_entry_totals AS
SELECT
  je.id                             AS entry_id,
  je.provider_id,
  je.booking_id,
  je.payment_id,
  je.refund_id,
  je.source,
  je.external_ref,
  je.posted_at,
  je.reporting_currency,
  COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'debit'),  0)::numeric AS debits,
  COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'credit'), 0)::numeric AS credits,
  (COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'debit'),  0)
 -  COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'credit'), 0))::numeric AS net
FROM public.journal_entries je
LEFT JOIN public.journal_lines jl ON jl.entry_id = je.id
GROUP BY je.id;

COMMENT ON VIEW public.v_journal_entry_totals IS
  'F14 Phase 3: per-entry debit/credit/net rollup. Source of truth for audit drill-downs.';

-- ─── Account balances view ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_ledger_account_balances AS
SELECT
  ga.id                            AS account_id,
  ga.code                          AS account_code,
  ga.name                          AS account_name,
  ga.type                          AS account_type,
  ga.normal_side,
  COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'debit'),  0)::numeric AS debit_total,
  COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'credit'), 0)::numeric AS credit_total,
  CASE
    WHEN ga.normal_side = 'debit'
      THEN COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'debit'),  0)
         - COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'credit'), 0)
    ELSE
      COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'credit'), 0)
    - COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'debit'),  0)
  END::numeric AS balance
FROM public.gl_accounts ga
LEFT JOIN public.journal_lines jl ON jl.account_id = ga.id
GROUP BY ga.id, ga.code, ga.name, ga.type, ga.normal_side;

COMMENT ON VIEW public.v_ledger_account_balances IS
  'F14 Phase 3: live balance per GL account, signed to match each account''s normal side.';

-- ─── Provider revenue (ledger-native) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ledger_provider_revenue(
  p_provider_id uuid,
  p_from        timestamptz DEFAULT '-infinity'::timestamptz,
  p_to          timestamptz DEFAULT 'infinity'::timestamptz
)
RETURNS TABLE (
  gross_payments    numeric,
  provider_payable  numeric,
  platform_fees     numeric,
  refunds           numeric,
  net_retained      numeric
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
    WHERE je.provider_id = p_provider_id
      AND je.posted_at  >= p_from
      AND je.posted_at   < p_to
  )
  SELECT
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '1000' AND side = 'debit'),  0)::numeric AS gross_payments,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2000' AND side = 'credit'), 0)::numeric AS provider_payable,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3000' AND side = 'credit'), 0)::numeric AS platform_fees,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '4100' AND side = 'debit'),  0)::numeric AS refunds,
    (COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2000' AND side = 'credit'), 0)
   - COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '4100' AND side = 'debit'),  0))::numeric AS net_retained
  FROM lines;
$$;

GRANT EXECUTE ON FUNCTION public.ledger_provider_revenue(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.ledger_provider_revenue IS
  'F14 Phase 3: ledger-native provider revenue rollup. Replacement for finance_transactions scans.';

-- ─── Platform revenue (ledger-native) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ledger_platform_revenue(
  p_from timestamptz DEFAULT '-infinity'::timestamptz,
  p_to   timestamptz DEFAULT 'infinity'::timestamptz
)
RETURNS TABLE (
  gross_payments  numeric,
  platform_fees   numeric,
  gateway_fees    numeric,
  refunds         numeric,
  provider_payable numeric,
  tax_payable     numeric,
  tips_payable    numeric,
  net_revenue     numeric
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
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '1000' AND side = 'debit'),  0)::numeric AS gross_payments,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3000' AND side = 'credit'), 0)::numeric AS platform_fees,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '4000' AND side = 'debit'),  0)::numeric AS gateway_fees,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '4100' AND side = 'debit'),  0)::numeric AS refunds,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2000' AND side = 'credit'), 0)::numeric AS provider_payable,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2100' AND side = 'credit'), 0)::numeric AS tax_payable,
    COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '2200' AND side = 'credit'), 0)::numeric AS tips_payable,
    (COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '3000' AND side = 'credit'), 0)
   - COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '4000' AND side = 'debit'),  0)
   - COALESCE(SUM(reporting_amount) FILTER (WHERE account_code = '4100' AND side = 'debit'),  0))::numeric AS net_revenue
  FROM lines;
$$;

GRANT EXECUTE ON FUNCTION public.ledger_platform_revenue(timestamptz, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.ledger_platform_revenue IS
  'F14 Phase 3: ledger-native platform revenue rollup for admin finance dashboards.';

-- ─── Reconciliation summary ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ledger_reconciliation_summary(
  p_from timestamptz DEFAULT '-infinity'::timestamptz,
  p_to   timestamptz DEFAULT 'infinity'::timestamptz
)
RETURNS TABLE (
  legacy_row_count       bigint,
  shadowed_row_count     bigint,
  missing_row_count      bigint,
  imbalanced_entry_count bigint,
  legacy_sum_abs         numeric,
  ledger_sum_debits      numeric,
  ledger_sum_credits     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH legacy AS (
    SELECT COUNT(*)                       AS total_rows,
           COALESCE(SUM(ABS(amount)), 0)::numeric AS sum_abs
    FROM public.finance_transactions ft
    WHERE COALESCE(ft.created_at, '-infinity'::timestamptz) >= p_from
      AND COALESCE(ft.created_at, 'infinity'::timestamptz)   < p_to
  ),
  shadowed AS (
    SELECT COUNT(*) AS total_rows
    FROM public.finance_transactions ft
    JOIN public.journal_entries je
      ON je.source = 'finance_transactions'
     AND je.external_ref = ft.id::text
    WHERE COALESCE(ft.created_at, '-infinity'::timestamptz) >= p_from
      AND COALESCE(ft.created_at, 'infinity'::timestamptz)   < p_to
  ),
  entries_in_window AS (
    SELECT je.id
    FROM public.journal_entries je
    WHERE je.posted_at >= p_from AND je.posted_at < p_to
  ),
  entry_totals AS (
    SELECT e.id,
           COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'debit'),  0) AS debits,
           COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'credit'), 0) AS credits
    FROM entries_in_window e
    LEFT JOIN public.journal_lines jl ON jl.entry_id = e.id
    GROUP BY e.id
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE debits <> credits) AS imbalanced,
      COALESCE(SUM(debits),  0)::numeric        AS total_debits,
      COALESCE(SUM(credits), 0)::numeric        AS total_credits
    FROM entry_totals
  )
  SELECT
    legacy.total_rows,
    shadowed.total_rows,
    GREATEST(legacy.total_rows - shadowed.total_rows, 0),
    totals.imbalanced,
    legacy.sum_abs,
    totals.total_debits,
    totals.total_credits
  FROM legacy, shadowed, totals;
$$;

GRANT EXECUTE ON FUNCTION public.ledger_reconciliation_summary(timestamptz, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.ledger_reconciliation_summary IS
  'F14 Phase 3: one-shot reconciliation between finance_transactions and journal_entries. Cron-friendly; returns counts + totals rather than row payloads.';

-- ─── Access control ──────────────────────────────────────────────────────────

GRANT SELECT ON public.v_journal_entry_totals     TO authenticated, service_role;
GRANT SELECT ON public.v_ledger_account_balances  TO service_role;
