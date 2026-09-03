-- 870: Ledger consistency follow-ups (Part C: C1 accrual, C2 consistency, C3 payout hardening)
--
-- 1. finance_transactions.currency BEFORE INSERT default from tenants.default_currency
-- 2. GL account 9999 "Suspense": unmapped transaction types post DR/CR suspense and
--    raise a reconciliation_exceptions flag instead of silently returning
-- 3. provider_subscription_refund reverses deferred (2810) first, then recognized
--    revenue (3100) using metadata {deferred_reversed, recognized_reversed}
-- 4. Subscription VAT leg: `tax` rows with metadata.vat_source =
--    'provider_subscription_payment' reclass VAT out of subscription revenue into
--    tax payable (DR 3100 / CR 2100); the refund mirror reverses it
-- 5. Partial unique index: one pending|processing payout request per provider
-- 6. debit_marketing_credit returns/persists the included vs purchased split
--    (credits.ts recognizes deferred marketing revenue on the purchased part only)
-- 7. recognize_period_revenue skips refunded subscription payments and caps
--    cumulative recognition at the original deferred amount
--
-- Idempotent: safe to re-run.

BEGIN;

-- ─── 0. Schema safety ─────────────────────────────────────────────────────────
-- Application writers and migrations 730/863 already read/write
-- finance_transactions.metadata; make the column existence explicit.
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── 1. Currency default trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_finance_transaction_default_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_currency text;
BEGIN
  IF NEW.currency IS NULL OR btrim(NEW.currency) = '' THEN
    IF NEW.tenant_id IS NOT NULL THEN
      SELECT t.default_currency INTO v_currency
      FROM public.tenants t
      WHERE t.id = NEW.tenant_id;
    END IF;
    IF (v_currency IS NULL OR btrim(v_currency) = '') AND NEW.provider_id IS NOT NULL THEN
      SELECT t.default_currency INTO v_currency
      FROM public.providers p
      JOIN public.tenants t ON t.id = p.tenant_id
      WHERE p.id = NEW.provider_id;
    END IF;
    NEW.currency := COALESCE(NULLIF(btrim(v_currency), ''), 'ZAR');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_transactions_default_currency ON public.finance_transactions;
CREATE TRIGGER finance_transactions_default_currency
  BEFORE INSERT ON public.finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_finance_transaction_default_currency();

COMMENT ON FUNCTION public.set_finance_transaction_default_currency() IS
  'BEFORE INSERT: when finance_transactions.currency is NULL, resolve from tenants.default_currency via tenant_id (then provider tenant), fallback ZAR.';

-- ─── 2. Suspense account ──────────────────────────────────────────────────────
INSERT INTO public.gl_accounts (code, name, type, normal_side) VALUES
  ('9999', 'Suspense (unmapped ledger postings)', 'asset', 'debit')
ON CONFLICT (code) DO NOTHING;

-- ─── 3. Payout request unique guard ───────────────────────────────────────────
-- Two open (pending|processing) payout requests for the same provider would let a
-- provider double-reserve the same balance. Guard at the DB level.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS ux_payouts_one_open_request_per_provider
    ON public.payouts (provider_id)
    WHERE status IN ('pending', 'processing');
EXCEPTION
  WHEN unique_violation THEN
    RAISE WARNING '870: ux_payouts_one_open_request_per_provider not created — duplicate open payouts exist; resolve and re-run this statement';
END $$;

-- ─── 4. Safe numeric metadata reader ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._ledger_meta_numeric(p_meta jsonb, p_key text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_meta IS NULL THEN RETURN NULL; END IF;
  RETURN NULLIF(btrim(p_meta->>p_key), '')::numeric;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- ─── 5. Shadow GL: suspense, refund split, subscription VAT leg ───────────────
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

GRANT EXECUTE ON FUNCTION public._shadow_replay_finance_tx_row(public.finance_transactions)
  TO service_role;
GRANT EXECUTE ON FUNCTION public._ledger_meta_numeric(jsonb, text)
  TO service_role;

-- ─── 6. Marketing credit debit: expose the included/purchased split ───────────
-- credits.ts recognizes deferred marketing revenue only for the PURCHASED
-- portion of a consumption debit (the monthly included grant is free and never
-- deferred). Return `from_included` / `from_purchased` and persist them on the
-- ledger row so the app never has to guess the split from a racy pre-read.
-- Same signature as migration 709 (CREATE OR REPLACE keeps grants).
CREATE OR REPLACE FUNCTION public.debit_marketing_credit(
  p_provider_id uuid,
  p_amount_zar numeric,
  p_reason text,
  p_idempotency_key text,
  p_channel text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_queue_row_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_included numeric;
  v_purchased numeric;
  v_remaining numeric;
  v_from_included numeric;
  v_balance_after numeric;
  v_existing record;
BEGIN
  IF p_amount_zar IS NULL OR p_amount_zar <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount must be positive');
  END IF;

  -- Idempotency: a prior identical debit already happened — return its result
  -- (including the persisted split when the row was written after 870).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT balance_after, metadata INTO v_existing
    FROM marketing_credit_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'balance_after', v_existing.balance_after,
        'idempotent', true,
        'from_included', public._ledger_meta_numeric(v_existing.metadata, 'from_included'),
        'from_purchased', public._ledger_meta_numeric(v_existing.metadata, 'from_purchased')
      );
    END IF;
  END IF;

  INSERT INTO provider_marketing_credits (provider_id)
  VALUES (p_provider_id)
  ON CONFLICT (provider_id) DO NOTHING;

  SELECT included_balance_zar, purchased_balance_zar
    INTO v_included, v_purchased
  FROM provider_marketing_credits
  WHERE provider_id = p_provider_id
  FOR UPDATE;

  v_included := COALESCE(v_included, 0);
  v_purchased := COALESCE(v_purchased, 0);

  IF v_included + v_purchased < p_amount_zar THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient');
  END IF;

  v_remaining := p_amount_zar;
  v_from_included := LEAST(v_included, v_remaining);
  v_included := v_included - v_from_included;
  v_remaining := v_remaining - v_from_included;
  IF v_remaining > 0 THEN
    v_purchased := v_purchased - v_remaining;
  END IF;
  v_balance_after := v_included + v_purchased;

  UPDATE provider_marketing_credits
  SET included_balance_zar = v_included,
      purchased_balance_zar = v_purchased,
      updated_at = now()
  WHERE provider_id = p_provider_id;

  INSERT INTO marketing_credit_ledger (
    provider_id, delta_zar, reason, channel, category,
    campaign_id, queue_row_id, idempotency_key, balance_after, metadata
  ) VALUES (
    p_provider_id, -p_amount_zar, p_reason, p_channel, p_category,
    p_campaign_id, p_queue_row_id, p_idempotency_key, v_balance_after,
    COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object('from_included', v_from_included, 'from_purchased', v_remaining)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'balance_after', v_balance_after,
    'from_included', v_from_included,
    'from_purchased', v_remaining
  );
EXCEPTION
  WHEN unique_violation THEN
    -- A concurrent identical debit won the idempotency race; return its result.
    SELECT balance_after, metadata INTO v_existing
    FROM marketing_credit_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true,
      'balance_after', COALESCE(v_existing.balance_after, 0),
      'idempotent', true,
      'from_included', public._ledger_meta_numeric(v_existing.metadata, 'from_included'),
      'from_purchased', public._ledger_meta_numeric(v_existing.metadata, 'from_purchased')
    );
END;
$$;

-- ─── 7. Recognizer: stop recognizing refunded subscription payments ───────────
-- provider-subscription-payment.ts now stamps refunds with
-- metadata.source_payment_id. Once a payment is refunded, the remaining
-- deferred balance was reversed by the refund row, so the daily recognizer must
-- not keep releasing it (which would drive 2810 negative). Body otherwise
-- identical to migration 863.
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
  -- Subscription recognition (deferred cash rows only, not yet refunded)
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
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_transactions r
        WHERE r.transaction_type = 'provider_subscription_refund'
          AND (r.metadata->>'source_payment_id') = ft.id::text
      )
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

    -- Never release more than the original deferred amount.
    SELECT COALESCE(SUM(net), 0)
    INTO v_recognized
    FROM public.finance_transactions
    WHERE transaction_type = 'subscription_recognition'
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
      'subscription_recognition',
      v_rec_amount,
      0, 0,
      v_rec_amount,
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
    v_amount := v_amount + v_rec_amount;
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

COMMIT;
