-- =============================================================================
-- 10141_finance_audit_run_allowlist.sql
-- F2-32  finance_audit_run executed arbitrary SELECT (service_role).
--        Named queries only. Date windows are YYYY-MM-DD suffixes, never
--        interpolated SQL from the caller.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.finance_audit_run(p_query TEXT)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text := lower(btrim(COALESCE(p_query, '')));
  v_key text;
  v_start timestamptz;
  v_end timestamptz;
  v_parts text[];
  v_window text := '';
BEGIN
  v_raw := regexp_replace(v_raw, '\s+', ' ', 'g');

  IF v_raw IN ('ping', 'select 1 as ok') THEN
    RETURN QUERY SELECT jsonb_build_object('ok', 1);
    RETURN;
  END IF;

  v_parts := string_to_array(v_raw, ':');
  v_key := v_parts[1];

  IF coalesce(array_length(v_parts, 1), 0) = 3
     AND v_parts[2] ~ '^\d{4}-\d{2}-\d{2}$'
     AND v_parts[3] ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_start := (v_parts[2] || 'T00:00:00.000Z')::timestamptz;
    v_end := (v_parts[3] || 'T23:59:59.999Z')::timestamptz;
    v_window := format(' AND created_at >= %L AND created_at <= %L', v_start, v_end);
  ELSIF coalesce(array_length(v_parts, 1), 1) <> 1 THEN
    RAISE EXCEPTION 'finance_audit_run: query is not on the allow-list';
  END IF;

  IF v_key = 'duplicate_source_payment_rows' THEN
    RETURN QUERY EXECUTE format(
      $q$
      SELECT row_to_json(t)::jsonb FROM (
        SELECT source_payment_id, transaction_type, COUNT(*) AS duplicate_count
          FROM public.finance_transactions
         WHERE source_payment_id IS NOT NULL
           %s
         GROUP BY source_payment_id, transaction_type
        HAVING COUNT(*) > 1
      ) t
      $q$,
      v_window
    );
    RETURN;
  END IF;

  IF v_key = 'completed_refunds_without_ledger' THEN
    RETURN QUERY EXECUTE format(
      $q$
      SELECT row_to_json(t)::jsonb FROM (
        SELECT br.id, br.booking_id, br.amount, br.status
          FROM public.booking_refunds br
          LEFT JOIN public.finance_transactions ft ON ft.source_refund_id = br.id
         WHERE br.status = 'completed' AND ft.id IS NULL
           %s
      ) t
      $q$,
      CASE WHEN v_start IS NOT NULL
        THEN format(' AND br.created_at >= %L AND br.created_at <= %L', v_start, v_end)
        ELSE ''
      END
    );
    RETURN;
  END IF;

  IF v_key = 'paid_product_orders_missing_ledger' THEN
    RETURN QUERY EXECUTE format(
      $q$
      SELECT row_to_json(t)::jsonb FROM (
        SELECT po.id, po.order_number, po.payment_method, po.created_at
          FROM public.product_orders po
         WHERE po.payment_status = 'paid'
           AND po.payment_method IN ('paystack', 'wallet', 'gift_card')
           AND NOT EXISTS (
             SELECT 1 FROM public.finance_transactions ft
              WHERE ft.transaction_type = 'provider_earnings'
                AND (
                  ft.product_order_id = po.id
                  OR (
                    ft.product_order_id IS NULL
                    AND ft.provider_id = po.provider_id
                    AND ft.description ILIKE '%%' || po.order_number || '%%'
                  )
                )
           )
           %s
      ) t
      $q$,
      CASE WHEN v_start IS NOT NULL
        THEN format(' AND po.created_at >= %L AND po.created_at <= %L', v_start, v_end)
        ELSE ''
      END
    );
    RETURN;
  END IF;

  IF v_key = 'handle_new_user_search_path' THEN
    RETURN QUERY
    SELECT row_to_json(t)::jsonb FROM (
      SELECT proconfig
        FROM pg_proc
       WHERE proname = 'handle_new_user'
         AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) t;
    RETURN;
  END IF;

  RAISE EXCEPTION 'finance_audit_run: query is not on the allow-list';
END;
$$;

REVOKE ALL ON FUNCTION public.finance_audit_run(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_audit_run(TEXT) TO service_role;

COMMENT ON FUNCTION public.finance_audit_run(TEXT) IS
  'Named read-only finance audit queries (F2-32 allow-list). service_role only.';
