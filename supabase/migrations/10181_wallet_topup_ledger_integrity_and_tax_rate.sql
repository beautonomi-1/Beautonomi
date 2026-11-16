-- Paid wallet top-ups must have a finance ledger leg, and a stored 0% tax
-- rate on a non-VAT-registered provider is not a data-quality violation.

CREATE OR REPLACE FUNCTION public.list_integrity_tax_rate_data_quality(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  provider_id UUID,
  business_name TEXT,
  tax_rate_percent NUMERIC,
  tax_rate_override_percent NUMERIC,
  tax_inclusive BOOLEAN,
  tenant_id UUID
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id AS provider_id,
    p.business_name,
    p.tax_rate_percent,
    p.tax_rate_override_percent,
    p.tax_inclusive,
    p.tenant_id
  FROM public.providers p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (
      (
        COALESCE(p.is_vat_registered, false) = true
        AND (p.tax_rate_percent IS NULL OR p.tax_rate_percent <= 0 OR p.tax_rate_percent > 100)
      )
      OR (p.tax_rate_percent IS NOT NULL AND (p.tax_rate_percent < 0 OR p.tax_rate_percent > 100))
      OR (
        p.tax_rate_override_percent IS NOT NULL
        AND (p.tax_rate_override_percent <= 0 OR p.tax_rate_override_percent > 100)
      )
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_integrity_paid_wallet_topups_missing_ledger(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  topup_id UUID,
  amount NUMERIC,
  tenant_id UUID,
  paid_at TIMESTAMPTZ,
  currency TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    wt.id AS topup_id,
    wt.amount,
    wt.tenant_id,
    wt.paid_at,
    wt.currency
  FROM public.wallet_topups wt
  WHERE wt.status = 'paid'
    AND (p_tenant_id IS NULL OR wt.tenant_id = p_tenant_id)
    AND NOT EXISTS (
      SELECT 1
        FROM public.finance_transactions ft
       WHERE ft.transaction_type = 'wallet_topup'
         AND (
           ft.metadata->>'wallet_topup_id' = wt.id::text
           OR ft.description = 'Wallet topup: ' || wt.id::text
         )
    )
  ORDER BY COALESCE(wt.paid_at, wt.created_at) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.repair_paid_wallet_topup_missing_ledger(p_topup_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topup public.wallet_topups%ROWTYPE;
  v_tenant uuid;
  v_ref text;
  v_currency text;
  v_at timestamptz;
  v_finance_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT * INTO v_topup
    FROM public.wallet_topups
   WHERE id = p_topup_id
     AND status = 'paid';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'paid_topup_not_found');
  END IF;

  v_tenant := v_topup.tenant_id;
  IF v_tenant IS NULL THEN
    SELECT u.preferred_home_tenant_id INTO v_tenant
      FROM public.users u
     WHERE u.id = v_topup.user_id;
  END IF;

  v_ref := COALESCE(NULLIF(btrim(v_topup.paystack_reference), ''), 'wallet_topup:' || v_topup.id::text);
  v_currency := COALESCE(NULLIF(btrim(v_topup.currency), ''), 'ZAR');
  v_at := COALESCE(v_topup.paid_at, v_topup.created_at, now());

  IF EXISTS (
    SELECT 1
      FROM public.finance_transactions ft
     WHERE ft.transaction_type = 'wallet_topup'
       AND (
         ft.metadata->>'wallet_topup_id' = v_topup.id::text
         OR ft.description = 'Wallet topup: ' || v_topup.id::text
         OR ft.metadata->>'reference' = v_ref
       )
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_posted', true, 'reference', v_ref);
  END IF;

  INSERT INTO public.payment_transactions (
    booking_id, reference, amount, fees, net_amount, status, provider,
    transaction_type, metadata, currency, created_at
  ) VALUES (
    NULL,
    v_ref,
    v_topup.amount,
    0,
    v_topup.amount,
    'success',
    'paystack',
    'wallet_topup',
    jsonb_build_object(
      'wallet_topup_id', v_topup.id,
      'fee_source', 'paystack',
      'repair', 'paid_wallet_topup_missing_ledger'
    ),
    v_currency,
    v_at
  )
  ON CONFLICT (provider, reference) DO NOTHING
  RETURNING id INTO v_payment_id;

  INSERT INTO public.finance_transactions (
    booking_id, provider_id, tenant_id, transaction_type,
    amount, fees, commission, net, currency, description, metadata, created_at
  ) VALUES (
    NULL,
    NULL,
    v_tenant,
    'wallet_topup',
    v_topup.amount,
    0,
    0,
    v_topup.amount,
    v_currency,
    'Wallet topup: ' || v_topup.id::text,
    jsonb_build_object(
      'reference', v_ref,
      'wallet_topup_id', v_topup.id,
      'currency', v_currency,
      'repair', 'paid_wallet_topup_missing_ledger'
    ),
    v_at
  )
  RETURNING id INTO v_finance_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_posted', false,
    'finance_transaction_id', v_finance_id,
    'payment_transaction_id', v_payment_id,
    'reference', v_ref,
    'amount', v_topup.amount
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'reason', SQLERRM);
END;
$$;

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

  IF v_key = 'paid_wallet_topups_missing_ledger' THEN
    RETURN QUERY
    SELECT row_to_json(t)::jsonb FROM (
      SELECT topup_id, amount, tenant_id, paid_at, currency
        FROM public.list_integrity_paid_wallet_topups_missing_ledger(NULL, 200)
    ) t;
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

REVOKE ALL ON FUNCTION public.list_integrity_tax_rate_data_quality(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_integrity_tax_rate_data_quality(UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.list_integrity_paid_wallet_topups_missing_ledger(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_integrity_paid_wallet_topups_missing_ledger(UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.repair_paid_wallet_topup_missing_ledger(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_paid_wallet_topup_missing_ledger(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.finance_audit_run(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_audit_run(TEXT) TO service_role;
