-- Migration 762: Terminal commerce GL shadow posting
--
-- Wires terminal_gl_account_map (752) into the finance_transactions shadow journal.
-- Terminal payment rows (terminal_sale, terminal_rental, etc.) were previously
-- rejected by the shadow trigger allowlist.

BEGIN;

CREATE OR REPLACE FUNCTION public._shadow_replay_terminal_commerce_row(p_row public.finance_transactions)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id         uuid;
  v_gross            numeric;
  v_fees             numeric;
  v_currency         text;
  v_map              public.terminal_gl_account_map%ROWTYPE;
  v_debit_acct       uuid;
  v_credit_acct      uuid;
  v_cogs_debit_acct  uuid;
  v_cogs_credit_acct uuid;
  v_gateway_acct     uuid;
  v_terminal_order_id uuid;
BEGIN
  SELECT * INTO v_map
  FROM public.terminal_gl_account_map
  WHERE transaction_type = p_row.transaction_type;

  IF NOT FOUND THEN
    RAISE WARNING '_shadow_replay_terminal_commerce_row: no map for type %', p_row.transaction_type;
    RETURN;
  END IF;

  v_gross    := abs(coalesce(p_row.amount, 0));
  v_fees     := abs(coalesce(p_row.fees, 0));
  v_currency := coalesce(p_row.currency, 'ZAR');

  SELECT id INTO v_debit_acct       FROM public.gl_accounts WHERE code = v_map.debit_account;
  SELECT id INTO v_credit_acct      FROM public.gl_accounts WHERE code = v_map.credit_account;
  SELECT id INTO v_cogs_debit_acct  FROM public.gl_accounts WHERE code = v_map.cogs_debit_account;
  SELECT id INTO v_cogs_credit_acct FROM public.gl_accounts WHERE code = v_map.cogs_credit_account;
  SELECT id INTO v_gateway_acct     FROM public.gl_accounts WHERE code = '4000';

  IF v_debit_acct IS NULL OR v_credit_acct IS NULL THEN
    RAISE WARNING '_shadow_replay_terminal_commerce_row: missing GL accounts for type %', p_row.transaction_type;
    RETURN;
  END IF;

  INSERT INTO public.journal_entries (
    tenant_id, provider_id, booking_id, payment_id, refund_id,
    source, external_ref, description,
    posted_at, reporting_currency, created_by
  ) VALUES (
    p_row.tenant_id,
    p_row.provider_id,
    p_row.booking_id,
    p_row.source_payment_id,
    p_row.source_refund_id,
    'finance_transactions',
    p_row.id::text,
    p_row.transaction_type,
    coalesce(p_row.created_at, now()),
    v_currency,
    'shadow-replay-terminal'
  ) RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
  VALUES
    (v_entry_id, v_debit_acct,  'debit',  v_gross - v_fees, v_currency, v_gross - v_fees, v_currency),
    (v_entry_id, v_credit_acct, 'credit', v_gross,          v_currency, v_gross,          v_currency);

  IF v_fees > 0 AND v_gateway_acct IS NOT NULL THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
  END IF;

  IF v_map.cogs_debit_account IS NOT NULL AND v_map.cogs_credit_account IS NOT NULL
     AND v_cogs_debit_acct IS NOT NULL AND v_cogs_credit_acct IS NOT NULL THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cogs_debit_acct,  'debit',  v_gross, v_currency, v_gross, v_currency),
      (v_entry_id, v_cogs_credit_acct, 'credit', v_gross, v_currency, v_gross, v_currency);
  END IF;

  v_terminal_order_id := NULLIF(p_row.metadata->>'terminal_order_id', '')::uuid;
  IF v_terminal_order_id IS NOT NULL THEN
    UPDATE public.terminal_orders
    SET accounting_sync_status = 'posted',
        accounting_posted_at   = coalesce(accounting_posted_at, now()),
        accounting_sync_error  = NULL
    WHERE id = v_terminal_order_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._shadow_replay_terminal_commerce_row(public.finance_transactions)
  TO service_role;

CREATE OR REPLACE FUNCTION public.shadow_post_finance_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.transaction_type IN (
    'terminal_sale', 'terminal_rental', 'terminal_bundle_alloc', 'terminal_promotion'
  ) THEN
    PERFORM public._shadow_replay_terminal_commerce_row(NEW);
    RETURN NEW;
  END IF;

  PERFORM public._shadow_replay_finance_tx_row(NEW);
  RETURN NEW;
END;
$$;

COMMIT;
