-- Migration: 724_finance_audit_run_rpc.sql
--
-- Creates the `finance_audit_run` RPC used by scripts/prod/audit-finance-ledger.mjs
-- and the nightly .github/workflows/finance-drift.yml CI check.
--
-- The function accepts a raw SQL query string and executes it via `EXECUTE USING`,
-- returning rows as JSONB. It is restricted to `service_role` only (no anon/authed access)
-- so it cannot be abused as a general SQL execution vector.
--
-- Inputs:
--   p_query TEXT — read-only SELECT query to audit finance_transactions / booking_refunds
--
-- Returns: SETOF JSONB (each row as a JSON object)

CREATE OR REPLACE FUNCTION public.finance_audit_run(p_query TEXT)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: only SELECT statements are permitted
  IF lower(trim(p_query)) NOT LIKE 'select%' THEN
    RAISE EXCEPTION 'finance_audit_run: only SELECT queries are allowed. Got: %', left(p_query, 80);
  END IF;

  RETURN QUERY EXECUTE
    format(
      'SELECT row_to_json(t)::jsonb FROM (%s) t',
      p_query
    );
END;
$$;

-- Restrict to service_role — revoke from public and authenticated
REVOKE ALL ON FUNCTION public.finance_audit_run(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_audit_run(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finance_audit_run(TEXT) TO service_role;

COMMENT ON FUNCTION public.finance_audit_run(TEXT) IS
  'Execute a read-only audit SELECT and return results as JSONB rows. '
  'Used by the nightly finance-drift CI job (service_role only).';
