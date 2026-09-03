-- 863: Phase 11 accrual finish + ledger consistency (Part C)
--
-- 1. billing_period_start/end on provider_subscriptions for recognition terms
-- 2. Ads consumption recognition on spent delta (CPC / impression packs)
-- 3. Extend recognize_period_revenue with time-based ads pro-rata
-- 4. Fix refund shadow GL to reverse each refund_component against its source account

BEGIN;

-- ─── Subscription billing term columns ───────────────────────────────────────
ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS billing_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS billing_period_end   timestamptz;

COMMENT ON COLUMN public.provider_subscriptions.billing_period_start IS
  'Start of the current paid subscription term (set on each successful charge).';
COMMENT ON COLUMN public.provider_subscriptions.billing_period_end IS
  'End of the current paid subscription term (used by recognize_period_revenue).';

-- ─── Ads consumption recognition (spent delta) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.recognize_ads_spend_delta(
  p_campaign_id uuid,
  p_delta_spent numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign   record;
  v_payment    record;
  v_recognized numeric;
  v_amount     numeric;
BEGIN
  IF p_campaign_id IS NULL OR COALESCE(p_delta_spent, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT c.id, c.provider_id, c.tenant_id, c.budget, c.spent, c.billing_model
  INTO v_campaign
  FROM public.ads_campaigns c
  WHERE c.id = p_campaign_id;

  IF NOT FOUND OR v_campaign.provider_id IS NULL THEN
    RETURN;
  END IF;

  -- Only consumption-based models recognize on spend; time-based uses cron pro-rata.
  IF COALESCE(v_campaign.billing_model, '') = 'time_based' THEN
    RETURN;
  END IF;

  SELECT
    ft.id,
    ft.amount,
    ft.currency,
    ft.tenant_id
  INTO v_payment
  FROM public.finance_transactions ft
  WHERE ft.transaction_type = 'provider_ads_payment'
    AND ft.provider_id = v_campaign.provider_id
    AND ft.net = 0
    AND (ft.metadata->>'campaign_id') = p_campaign_id::text
  ORDER BY ft.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(net), 0)
  INTO v_recognized
  FROM public.finance_transactions
  WHERE transaction_type = 'ads_recognition'
    AND provider_id = v_campaign.provider_id
    AND (metadata->>'source_payment_id') = v_payment.id::text;

  v_amount := LEAST(p_delta_spent, GREATEST(v_payment.amount - v_recognized, 0));
  IF v_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.finance_transactions (
    tenant_id, provider_id, transaction_type,
    amount, fees, commission, net, currency,
    metadata, created_at
  ) VALUES (
    COALESCE(v_payment.tenant_id, v_campaign.tenant_id),
    v_campaign.provider_id,
    'ads_recognition',
    v_amount, 0, 0, v_amount,
    COALESCE(v_payment.currency, 'ZAR'),
    jsonb_build_object(
      'source_payment_id', v_payment.id,
      'campaign_id', p_campaign_id,
      'recognition_basis', 'consumption',
      'delta_spent', p_delta_spent
    ),
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ads_recognize_on_spent_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delta numeric;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.spent IS NULL OR OLD.spent IS NULL THEN
    RETURN NEW;
  END IF;
  v_delta := NEW.spent - OLD.spent;
  IF v_delta > 0 THEN
    PERFORM public.recognize_ads_spend_delta(NEW.id, v_delta);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ads_recognize_on_spent_update ON public.ads_campaigns;
CREATE TRIGGER ads_recognize_on_spent_update
  AFTER UPDATE OF spent ON public.ads_campaigns
  FOR EACH ROW
  WHEN (NEW.spent IS DISTINCT FROM OLD.spent)
  EXECUTE FUNCTION public.ads_recognize_on_spent_update();

-- ─── recognize_period_revenue: subscription + time-based ads ─────────────────
CREATE OR REPLACE FUNCTION public.recognize_period_revenue(
  p_tenant_id    uuid,
  p_period_start timestamptz,
  p_period_end   timestamptz
)
RETURNS TABLE(
  recognized_count  int,
  recognized_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count          int     := 0;
  v_amount         numeric := 0;
  v_row            record;
  v_days           int;
  v_amount_per_day numeric;
  v_rec_id         uuid;
  v_recognized     numeric;
  v_rec_amount     numeric;
BEGIN
  -- Subscription recognition (deferred cash rows only)
  FOR v_row IN
    SELECT
      ft.id                AS payment_id,
      ft.amount            AS payment_amount,
      ft.provider_id,
      ft.tenant_id,
      ft.currency,
      COALESCE(ps.billing_period_start, ft.created_at)                      AS term_start,
      COALESCE(ps.billing_period_end,   ft.created_at + interval '1 month') AS term_end
    FROM public.finance_transactions ft
    LEFT JOIN public.provider_subscriptions ps
      ON  ps.tenant_id   = ft.tenant_id
      AND ps.provider_id = ft.provider_id
    WHERE ft.tenant_id        = p_tenant_id
      AND ft.transaction_type = 'provider_subscription_payment'
      AND ft.net              = 0
      AND ft.created_at       < p_period_end
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.finance_transactions
      WHERE transaction_type = 'subscription_recognition'
        AND tenant_id         = p_tenant_id
        AND provider_id       = v_row.provider_id
        AND created_at        >= p_period_start
        AND created_at        <  p_period_end
        AND (metadata->>'source_payment_id') = v_row.payment_id::text
    ) THEN
      CONTINUE;
    END IF;

    v_days := GREATEST(
      EXTRACT(epoch FROM
        LEAST(v_row.term_end, p_period_end) - GREATEST(v_row.term_start, p_period_start)
      )::int / 86400,
      0
    );
    IF v_days = 0 THEN CONTINUE; END IF;

    v_amount_per_day := v_row.payment_amount / GREATEST(
      EXTRACT(epoch FROM v_row.term_end - v_row.term_start)::int / 86400,
      1
    );

    INSERT INTO public.finance_transactions (
      tenant_id, provider_id, transaction_type,
      amount, fees, commission, net, currency,
      metadata, created_at
    ) VALUES (
      p_tenant_id,
      v_row.provider_id,
      'subscription_recognition',
      v_days * v_amount_per_day,
      0, 0,
      v_days * v_amount_per_day,
      COALESCE(v_row.currency, 'ZAR'),
      jsonb_build_object(
        'source_payment_id', v_row.payment_id,
        'period_start',      p_period_start,
        'period_end',        p_period_end,
        'days',              v_days,
        'recognition_basis', 'term'
      ),
      p_period_start
    ) RETURNING id INTO v_rec_id;

    v_count  := v_count + 1;
    v_amount := v_amount + (v_days * v_amount_per_day);
  END LOOP;

  -- Time-based ads: pro-rata deferred budget over campaign window
  FOR v_row IN
    SELECT
      ft.id         AS payment_id,
      ft.amount     AS payment_amount,
      ft.provider_id,
      ft.currency,
      c.id          AS campaign_id,
      COALESCE(c.start_at, ft.created_at) AS term_start,
      COALESCE(c.end_at,   ft.created_at + interval '7 days') AS term_end
    FROM public.finance_transactions ft
    JOIN public.ads_campaigns c
      ON (ft.metadata->>'campaign_id') = c.id::text
     AND c.provider_id = ft.provider_id
    WHERE ft.tenant_id        = p_tenant_id
      AND ft.transaction_type = 'provider_ads_payment'
      AND ft.net              = 0
      AND c.billing_model     = 'time_based'
      AND ft.created_at       < p_period_end
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.finance_transactions
      WHERE transaction_type = 'ads_recognition'
        AND tenant_id         = p_tenant_id
        AND provider_id       = v_row.provider_id
        AND created_at        >= p_period_start
        AND created_at        <  p_period_end
        AND (metadata->>'source_payment_id') = v_row.payment_id::text
    ) THEN
      CONTINUE;
    END IF;

    v_days := GREATEST(
      EXTRACT(epoch FROM
        LEAST(v_row.term_end, p_period_end) - GREATEST(v_row.term_start, p_period_start)
      )::int / 86400,
      0
    );
    IF v_days = 0 THEN CONTINUE; END IF;

    v_amount_per_day := v_row.payment_amount / GREATEST(
      EXTRACT(epoch FROM v_row.term_end - v_row.term_start)::int / 86400,
      1
    );

    SELECT COALESCE(SUM(net), 0)
    INTO v_recognized
    FROM public.finance_transactions
    WHERE transaction_type = 'ads_recognition'
      AND (metadata->>'source_payment_id') = v_row.payment_id::text;

    v_rec_amount := LEAST(
      v_days * v_amount_per_day,
      GREATEST(v_row.payment_amount - v_recognized, 0)
    );
    IF v_rec_amount <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.finance_transactions (
      tenant_id, provider_id, transaction_type,
      amount, fees, commission, net, currency,
      metadata, created_at
    ) VALUES (
      p_tenant_id,
      v_row.provider_id,
      'ads_recognition',
      v_rec_amount, 0, 0, v_rec_amount,
      COALESCE(v_row.currency, 'ZAR'),
      jsonb_build_object(
        'source_payment_id', v_row.payment_id,
        'campaign_id',       v_row.campaign_id,
        'period_start',      p_period_start,
        'period_end',        p_period_end,
        'days',              v_days,
        'recognition_basis', 'term'
      ),
      p_period_start
    );

    v_count  := v_count + 1;
    v_amount := v_amount + v_rec_amount;
  END LOOP;

  RETURN QUERY SELECT v_count, v_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recognize_period_revenue(uuid, timestamptz, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.recognize_ads_spend_delta(uuid, numeric)
  TO service_role;

-- ─── Refund shadow GL: reverse each component against its source account ──────
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
  v_gross            numeric := COALESCE(p_row.amount, 0);
  v_fees             numeric := COALESCE(p_row.fees,   0);
  v_platform_fee     numeric := COALESCE(p_row.net,    0);
  v_currency         text    := COALESCE(p_row.currency, 'ZAR');
BEGIN
  IF p_row.transaction_type IS NULL THEN RETURN; END IF;

  IF p_row.transaction_type = 'gift_card_liability_reduction' THEN RETURN; END IF;
  IF p_row.transaction_type = 'provider_earnings' THEN RETURN; END IF;
  IF p_row.transaction_type = 'membership_sale' AND COALESCE(v_gross, 0) = 0 THEN RETURN; END IF;

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
    RAISE WARNING 'shadow_post_finance_transaction: unhandled transaction_type %', p_row.transaction_type;
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

  -- (Body matches migration 809 except refund branch — patched below.)
  IF p_row.transaction_type IN ('payment', 'additional_charge_payment') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  v_gross - v_fees,           v_currency, v_gross - v_fees,           v_currency),
      (v_entry_id, v_platform_acct, 'credit', v_platform_fee,             v_currency, v_platform_fee,             v_currency),
      (v_entry_id, v_payable_acct,  'credit', v_gross - v_platform_fee,   v_currency, v_gross - v_platform_fee,   v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
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
    ELSIF p_row.refund_component IN ('promotion_discount', 'membership_discount', 'loyalty_redemption', 'loyalty_discount') THEN
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
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_tax_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_cash_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
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
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_tax_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

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
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_subs_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,     'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

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

GRANT EXECUTE ON FUNCTION public._shadow_replay_finance_tx_row(public.finance_transactions)
  TO service_role;

COMMIT;
