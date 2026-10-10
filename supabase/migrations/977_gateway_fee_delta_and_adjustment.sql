-- 977: Late PSP gateway fee correction (journal delta + locked-period adjustment rows)
--
-- Application calls post_gateway_fee_delta() when the real fee arrives after insert.
-- metadata.fee_journaled on new charge rows records what the shadow trigger posted.
-- Locked periods: insert finance_transactions.gateway_fee_adjustment (current period).

BEGIN;

CREATE OR REPLACE FUNCTION public._shadow_replay_gateway_fee_adjustment_row(p_row public.finance_transactions)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id      uuid;
  v_cash_acct     uuid;
  v_gateway_acct  uuid;
  v_delta         numeric := COALESCE(p_row.amount, 0);
  v_currency      text    := COALESCE(p_row.currency, 'ZAR');
BEGIN
  IF p_row.transaction_type IS DISTINCT FROM 'gateway_fee_adjustment' THEN
    RETURN;
  END IF;
  IF v_delta = 0 THEN
    RETURN;
  END IF;

  SELECT id INTO v_cash_acct    FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_gateway_acct FROM public.gl_accounts WHERE code = '4000';

  INSERT INTO public.journal_entries (
    tenant_id, provider_id, booking_id,
    source, external_ref, description,
    posted_at, reporting_currency, created_by
  ) VALUES (
    p_row.tenant_id,
    p_row.provider_id,
    p_row.booking_id,
    'finance_transactions',
    p_row.id::text,
    'gateway_fee_adjustment',
    COALESCE(p_row.created_at, now()),
    v_currency,
    'shadow-replay'
  ) RETURNING id INTO v_entry_id;

  IF v_delta > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_gateway_acct, 'debit',  v_delta, v_currency, v_delta, v_currency),
      (v_entry_id, v_cash_acct,    'credit', v_delta, v_currency, v_delta, v_currency);
  ELSE
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_delta), v_currency, abs(v_delta), v_currency),
      (v_entry_id, v_gateway_acct, 'credit', abs(v_delta), v_currency, abs(v_delta), v_currency);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._shadow_replay_gateway_fee_adjustment_row(public.finance_transactions)
  TO service_role;

CREATE OR REPLACE FUNCTION public.post_gateway_fee_delta(
  p_finance_tx_id uuid,
  p_new_fee numeric,
  p_fee_source text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row           public.finance_transactions%ROWTYPE;
  v_journaled     numeric;
  v_delta         numeric;
  v_external_ref  text;
  v_entry_id      uuid;
  v_cash_acct     uuid;
  v_gateway_acct  uuid;
  v_currency      text;
  v_meta          jsonb;
BEGIN
  IF p_finance_tx_id IS NULL OR p_new_fee IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.finance_transactions WHERE id = p_finance_tx_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.transaction_type IN ('payout', 'payout_transfer_fee') THEN
    RETURN;
  END IF;

  v_journaled := COALESCE(
    NULLIF(v_row.metadata->>'fee_journaled', '')::numeric,
    COALESCE(v_row.fees, 0)
  );
  v_delta := round(p_new_fee::numeric, 2) - round(v_journaled, 2);
  IF abs(v_delta) < 0.0001 THEN
    RETURN;
  END IF;

  v_external_ref := 'fee:' || p_finance_tx_id::text || ':' || round(p_new_fee::numeric, 2)::text;
  IF EXISTS (
    SELECT 1 FROM public.journal_entries je WHERE je.external_ref = v_external_ref
  ) THEN
    RETURN;
  END IF;

  IF v_row.tenant_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.financial_period_locks fpl
    WHERE fpl.tenant_id = v_row.tenant_id
      AND COALESCE(v_row.created_at, now())::date BETWEEN fpl.period_start AND fpl.period_end
  ) THEN
    RAISE EXCEPTION 'finance period locked for finance_tx %', p_finance_tx_id
      USING ERRCODE = '22000';
  END IF;

  v_currency := COALESCE(v_row.currency, 'ZAR');
  SELECT id INTO v_cash_acct    FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_gateway_acct FROM public.gl_accounts WHERE code = '4000';

  INSERT INTO public.journal_entries (
    tenant_id, provider_id, booking_id, payment_id,
    source, external_ref, description,
    posted_at, reporting_currency, created_by
  ) VALUES (
    v_row.tenant_id,
    v_row.provider_id,
    v_row.booking_id,
    v_row.source_payment_id,
    'gateway_fee_delta',
    v_external_ref,
    'Gateway fee correction for ' || v_row.transaction_type,
    now(),
    v_currency,
    'post_gateway_fee_delta'
  ) RETURNING id INTO v_entry_id;

  IF v_delta > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_gateway_acct, 'debit',  v_delta, v_currency, v_delta, v_currency),
      (v_entry_id, v_cash_acct,    'credit', v_delta, v_currency, v_delta, v_currency);
  ELSE
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_delta), v_currency, abs(v_delta), v_currency),
      (v_entry_id, v_gateway_acct, 'credit', abs(v_delta), v_currency, abs(v_delta), v_currency);
  END IF;

  v_meta := COALESCE(v_row.metadata, '{}'::jsonb);
  v_meta := v_meta || jsonb_build_object(
    'fee_journaled', round(p_new_fee::numeric, 2),
    'fee_source', COALESCE(p_fee_source, v_meta->>'fee_source')
  );

  UPDATE public.finance_transactions
  SET
    fees = round(p_new_fee::numeric, 2),
    metadata = v_meta
  WHERE id = p_finance_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_gateway_fee_delta(uuid, numeric, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.shadow_post_finance_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.transaction_type = 'gateway_fee_adjustment' THEN
    PERFORM public._shadow_replay_gateway_fee_adjustment_row(NEW);
    RETURN NEW;
  END IF;

  IF NEW.transaction_type = 'gift_card_refund'
     OR (NEW.transaction_type = 'refund'
         AND NEW.refund_component IN ('membership_sale', 'membership_provider_earnings'))
     OR (NEW.transaction_type = 'membership_sale'
         AND COALESCE(NEW.metadata->>'tender', '') = 'wallet'
         AND COALESCE(NEW.amount, 0) <> 0)
  THEN
    PERFORM public._shadow_replay_membership_gift_card_row(NEW);
    RETURN NEW;
  END IF;

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

COMMENT ON FUNCTION public.post_gateway_fee_delta(uuid, numeric, text) IS
  'Posts cash/gateway-fee journal delta when PSP fee arrives after finance_transactions insert. '
  'Sets metadata.fee_journaled. Raises when created_at is in a locked period — caller inserts gateway_fee_adjustment instead.';

COMMIT;
