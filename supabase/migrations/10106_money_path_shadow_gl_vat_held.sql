-- 10106: Provider-held VAT maps to provider payable in shadow GL (supersedes 870 tax/refund tax branches)

CREATE OR REPLACE FUNCTION public._shadow_replay_finance_tx_row(p_row public.finance_transactions)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id         uuid;
  v_cash_acct        uuid;
  v_cash_hand_acct   uuid;
  v_payable_acct     uuid;
  v_platform_acct    uuid;
  v_refund_acct      uuid;
  v_tax_acct         uuid;
  v_tips_acct        uuid;
  v_cashback_acct    uuid;
  v_wallet_acct      uuid;
  v_gift_acct        uuid;
  v_loyalty_acct     uuid;
  v_membership_acct  uuid;
  v_subs_acct        uuid;
  v_ads_acct         uuid;
  v_marketing_acct   uuid;
  v_promo_contra     uuid;
  v_promo_expense    uuid;
  v_adjust_acct      uuid;
  v_gateway_acct     uuid;
  v_def_subs_acct    uuid;
  v_def_ads_acct     uuid;
  v_def_mkt_acct     uuid;
  v_suspense_acct    uuid;
  v_gross            numeric := COALESCE(p_row.amount, 0);
  v_fees             numeric := COALESCE(p_row.fees,   0);
  v_platform_fee     numeric := COALESCE(p_row.net,    0);
  v_currency         text    := COALESCE(p_row.currency, 'ZAR');
  v_vat_source       text    := p_row.metadata->>'vat_source';
  v_recognized_part  numeric;
  v_deferred_part    numeric;
  v_flag_tenant      uuid;
BEGIN
  IF p_row.transaction_type IS NULL THEN RETURN; END IF;

  IF p_row.transaction_type = 'gift_card_liability_reduction' THEN RETURN; END IF;
  IF p_row.transaction_type = 'provider_earnings' THEN RETURN; END IF;
  IF p_row.transaction_type = 'membership_sale' AND COALESCE(v_gross, 0) = 0 THEN RETURN; END IF;

  -- Terminal commerce rows are posted by migration 762's dedicated function
  -- (the trigger wrapper routes them there; replays that call this function
  -- directly must not land them in suspense).
  IF p_row.transaction_type IN (
    'terminal_sale', 'terminal_rental', 'terminal_bundle_alloc', 'terminal_promotion'
  ) THEN
    PERFORM public._shadow_replay_terminal_commerce_row(p_row);
    RETURN;
  END IF;

  SELECT id INTO v_cash_acct       FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_cash_hand_acct  FROM public.gl_accounts WHERE code = '1100';
  SELECT id INTO v_payable_acct    FROM public.gl_accounts WHERE code = '2000';
  SELECT id INTO v_tax_acct        FROM public.gl_accounts WHERE code = '2100';
  SELECT id INTO v_tips_acct       FROM public.gl_accounts WHERE code = '2200';
  SELECT id INTO v_cashback_acct   FROM public.gl_accounts WHERE code = '2210';
  SELECT id INTO v_wallet_acct     FROM public.gl_accounts WHERE code = '2300';
  SELECT id INTO v_gift_acct       FROM public.gl_accounts WHERE code = '2400';
  SELECT id INTO v_loyalty_acct    FROM public.gl_accounts WHERE code = '2500';
  SELECT id INTO v_membership_acct FROM public.gl_accounts WHERE code = '2600';
  SELECT id INTO v_def_subs_acct   FROM public.gl_accounts WHERE code = '2810';
  SELECT id INTO v_def_ads_acct    FROM public.gl_accounts WHERE code = '2820';
  SELECT id INTO v_def_mkt_acct    FROM public.gl_accounts WHERE code = '2830';
  SELECT id INTO v_platform_acct   FROM public.gl_accounts WHERE code = '3000';
  SELECT id INTO v_subs_acct       FROM public.gl_accounts WHERE code = '3100';
  SELECT id INTO v_ads_acct        FROM public.gl_accounts WHERE code = '3300';
  SELECT id INTO v_marketing_acct  FROM public.gl_accounts WHERE code = '3400';
  SELECT id INTO v_promo_contra    FROM public.gl_accounts WHERE code = '3500';
  SELECT id INTO v_adjust_acct     FROM public.gl_accounts WHERE code = '3900';
  SELECT id INTO v_refund_acct     FROM public.gl_accounts WHERE code = '4100';
  SELECT id INTO v_gateway_acct    FROM public.gl_accounts WHERE code = '4000';
  SELECT id INTO v_promo_expense   FROM public.gl_accounts WHERE code = '5100';
  SELECT id INTO v_suspense_acct   FROM public.gl_accounts WHERE code = '9999';

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
    COALESCE(p_row.created_at, now()),
    v_currency,
    'shadow-replay'
  ) RETURNING id INTO v_entry_id;

  -- ── Unmapped types: suspense + reconciliation flag (never silently skipped) ──
  IF p_row.transaction_type NOT IN (
    'payment', 'additional_charge_payment', 'platform_fee',
    'refund', 'provider_refund',
    'tip', 'cashback', 'tax', 'travel_fee', 'cancellation_fee', 'service_fee',
    'payout', 'payout_transfer_fee',
    'wallet_payment', 'wallet_topup',
    'gift_card_payment', 'gift_card_sale', 'gift_card_redemption', 'gift_card_breakage',
    'loyalty_redemption',
    'promotion_discount', 'membership_discount', 'manual_adjustment',
    'walk_in_additional_charge',
    'membership_sale', 'membership_recognition', 'membership_provider_earnings',
    'provider_subscription_payment', 'subscription_recognition', 'provider_subscription_refund',
    'provider_ads_payment', 'ads_recognition', 'provider_ads_refund',
    'provider_marketing_credit_topup', 'marketing_credit_recognition', 'provider_marketing_credit_refund'
  ) THEN
    -- Balanced DR/CR on 9999 so the entry exists (reconciliation view sees a
    -- journal for every finance row) and the amount is visible on the suspense
    -- account's activity without guessing which real account it belongs to.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_suspense_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_suspense_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

    v_flag_tenant := p_row.tenant_id;
    IF v_flag_tenant IS NULL AND p_row.provider_id IS NOT NULL THEN
      SELECT tenant_id INTO v_flag_tenant FROM public.providers WHERE id = p_row.provider_id;
    END IF;

    IF v_flag_tenant IS NOT NULL THEN
      BEGIN
        INSERT INTO public.reconciliation_exceptions (
          tenant_id, currency, psp, source, external_id, internal_id, amount,
          status, mismatch_reason, metadata
        )
        SELECT
          v_flag_tenant, v_currency, 'internal', 'ledger', p_row.id::text, p_row.id, p_row.amount,
          'open', 'unmapped_transaction_type',
          jsonb_build_object(
            'transaction_type', p_row.transaction_type,
            'journal_entry_id', v_entry_id,
            'gl_account', '9999',
            'provider_id', p_row.provider_id,
            'booking_id', p_row.booking_id
          )
        WHERE NOT EXISTS (
          SELECT 1 FROM public.reconciliation_exceptions re
          WHERE re.internal_id = p_row.id
            AND re.mismatch_reason = 'unmapped_transaction_type'
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'shadow_post_finance_transaction: could not flag reconciliation exception for % (%)', p_row.id, SQLERRM;
      END;
    END IF;

    RAISE WARNING 'shadow_post_finance_transaction: unmapped transaction_type % posted to suspense 9999 (finance_tx %)', p_row.transaction_type, p_row.id;
    RETURN;
  END IF;

  IF p_row.transaction_type IN ('payment', 'additional_charge_payment') THEN
    -- Product payment.amount is already the provider gross (order total minus the
    -- platform fee, VAT still inside). The platform fee is its own row. Treating
    -- payment.net as that fee again would book the fee twice and understate payable.
    IF p_row.product_order_id IS NOT NULL AND p_row.transaction_type = 'payment' THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_cash_acct,    'debit',  v_gross - v_fees, v_currency, v_gross - v_fees, v_currency),
        (v_entry_id, v_payable_acct, 'credit', v_gross,          v_currency, v_gross,          v_currency);
      IF v_fees > 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
          (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
      END IF;
    ELSE
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_cash_acct,     'debit',  v_gross - v_fees,           v_currency, v_gross - v_fees,           v_currency),
        (v_entry_id, v_platform_acct, 'credit', v_platform_fee,             v_currency, v_platform_fee,             v_currency),
        (v_entry_id, v_payable_acct,  'credit', v_gross - v_platform_fee,   v_currency, v_gross - v_platform_fee,   v_currency);
      IF v_fees > 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
          (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
      END IF;
    END IF;

  ELSIF p_row.transaction_type = 'platform_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type IN ('refund', 'provider_refund') THEN
    IF p_row.refund_component = 'gift_card_liability_reduction' THEN
      DELETE FROM public.journal_entries WHERE id = v_entry_id;
      RETURN;
    ELSIF p_row.refund_component = 'wallet_payment' THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_payable_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_wallet_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF p_row.refund_component = 'gift_card_payment' THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_payable_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_gift_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF p_row.refund_component = 'cashback' THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, COALESCE(v_cash_hand_acct, v_cash_acct), 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, COALESCE(v_cashback_acct, v_cash_hand_acct), 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF p_row.refund_component IN ('promotion_discount', 'membership_discount', 'loyalty_redemption') THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_promo_expense, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_promo_contra,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF p_row.refund_component IN ('platform_fee', 'service_fee', 'payment', 'additional_charge_payment') THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_platform_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_cash_acct,     'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF p_row.refund_component = 'tip' THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_tips_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_cash_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF p_row.refund_component = 'tax' THEN
      IF COALESCE((p_row.metadata->>'vat_held_for_provider_amount')::numeric, 0) > 0
         OR COALESCE((p_row.metadata->>'vat_held_for_provider')::boolean, false) THEN
        INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
          (v_entry_id, v_payable_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
          (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
      ELSE
        INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
          (v_entry_id, v_tax_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
          (v_entry_id, v_cash_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
      END IF;
    ELSIF p_row.refund_component IN ('travel_fee', 'cancellation_fee', 'provider_earnings', 'walk_in_additional_charge') THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_payable_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSE
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_payable_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    END IF;

  ELSIF p_row.transaction_type = 'cashback' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, COALESCE(v_cashback_acct, v_cash_hand_acct), 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, COALESCE(v_cash_hand_acct, v_cash_acct), 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'tip' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_tips_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'tax' THEN
    -- Subscription VAT leg (provider-subscription-payment.ts): the payment row
    -- credits deferred 2810 for the VAT-inclusive gross and the recognizer
    -- releases that gross into 3100 over the term. The VAT leg therefore
    -- reclasses the VAT portion out of subscription revenue into tax payable
    -- (no cash movement — the cash was already debited by the payment row).
    IF v_vat_source = 'provider_subscription_payment' THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_subs_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_tax_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF v_vat_source = 'provider_subscription_refund' THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_tax_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_subs_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF v_vat_source = 'product_order' THEN
      -- Product payment.amount already includes this VAT. The payment shadow
      -- credits provider payable for (amount - platform fee), so a second
      -- payable credit here would pay the VAT twice.
      DELETE FROM public.journal_entries WHERE id = v_entry_id;
      RETURN;
    ELSIF COALESCE((p_row.metadata->>'vat_held_for_provider')::boolean, false) THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_cash_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSE
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_tax_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    END IF;

  ELSIF p_row.transaction_type = 'service_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type IN ('travel_fee', 'cancellation_fee') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'payout' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_payable_acct, 'debit',  abs(v_gross),          v_currency, abs(v_gross),          v_currency),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'credit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  ELSIF p_row.transaction_type = 'payout_transfer_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_gateway_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'wallet_topup' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,   'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_wallet_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  ELSIF p_row.transaction_type = 'wallet_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_wallet_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'gift_card_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_gift_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type IN ('promotion_discount', 'membership_discount') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_promo_expense, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_promo_contra,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'loyalty_redemption' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_loyalty_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_promo_contra, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'manual_adjustment' THEN
    IF v_gross >= 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_cash_acct,   'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_adjust_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSE
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_adjust_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    END IF;

  ELSIF p_row.transaction_type = 'walk_in_additional_charge' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_hand_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'gift_card_sale' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_gift_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  ELSIF p_row.transaction_type = 'gift_card_redemption' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_gift_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'gift_card_breakage' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_gift_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'membership_sale' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,       'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_membership_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  ELSIF p_row.transaction_type = 'membership_recognition' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_membership_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'membership_provider_earnings' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_membership_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'provider_subscription_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_def_subs_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  ELSIF p_row.transaction_type = 'subscription_recognition' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_subs_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_subs_acct,     'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'provider_subscription_refund' THEN
    -- Component split (provider-subscription-payment.ts writes
    -- metadata.deferred_reversed / metadata.recognized_reversed):
    --   DR 2810 deferred   for the not-yet-recognized remainder
    --   DR 3100 revenue    for the portion already released by the recognizer
    --   CR 1000 cash       for the full refund
    -- Legacy rows without the split metadata reverse everything from deferred.
    v_recognized_part := LEAST(
      abs(v_gross),
      GREATEST(COALESCE(public._ledger_meta_numeric(p_row.metadata, 'recognized_reversed'), 0), 0)
    );
    v_deferred_part := abs(v_gross) - v_recognized_part;
    IF v_deferred_part > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_def_subs_acct, 'debit', v_deferred_part, v_currency, v_deferred_part, v_currency);
    END IF;
    IF v_recognized_part > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_subs_acct, 'debit', v_recognized_part, v_currency, v_recognized_part, v_currency);
    END IF;
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'provider_ads_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_def_ads_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  ELSIF p_row.transaction_type = 'ads_recognition' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_ads_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_ads_acct,     'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'provider_ads_refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_ads_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'provider_marketing_credit_topup' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_def_mkt_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  ELSIF p_row.transaction_type = 'marketing_credit_recognition' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_mkt_acct,   'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_marketing_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'provider_marketing_credit_refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_mkt_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
  END IF;
END;
$$;
