-- ============================================================================
-- Migration 704: Marketing credit topup revenue + reversal accounting
-- ============================================================================
-- Until now, provider marketing credit top-ups (Paystack) only bumped the
-- provider's prepaid balance in `provider_marketing_credits` /
-- `marketing_credit_ledger`. The cash received was invisible to platform
-- finance: no `finance_transactions` row, no double-entry journal, no admin
-- revenue attribution. This migration closes that gap by mirroring the
-- provider_ads_payment pattern (immediate revenue recognition at purchase):
--
--   provider_marketing_credit_topup  → DR Cash (1000) / CR Marketing revenue (3400)
--   provider_marketing_credit_refund → DR Marketing revenue (3400) / CR Cash (1000)
--
-- The operational `finance_transactions` row carries amount/fees/net so gateway
-- fees stay reportable; the shadow journal posts gross on both sides exactly
-- like every other revenue type (ads/subscription), keeping the double entry
-- balanced and reconciliation drift-free.
--
-- NOTE: marketing credits are a non-refundable prepaid platform service, so we
-- recognise revenue at purchase (consistent with ads). Consumption at send time
-- (campaign_send / automation_send) draws down the prepaid balance only and does
-- NOT post additional finance rows — the revenue was already recognised on cash
-- receipt. Refunds of *failed sends* return credits to the balance (operational
-- only); a refund of the *purchase itself* posts provider_marketing_credit_refund.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. New GL account
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.gl_accounts (code, name, type, normal_side) VALUES
  ('3400', 'Marketing credit revenue', 'revenue', 'credit')
ON CONFLICT (code) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Extend the shadow replay twin + trigger allowlist
--    Reproduces 664's function bodies verbatim with the two new marketing
--    credit types added to both allowlists and two new ELSIF branches.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._shadow_replay_finance_tx_row(p_row public.finance_transactions)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id        uuid;
  v_cash_acct       uuid;
  v_cash_hand_acct  uuid;
  v_payable_acct    uuid;
  v_platform_acct   uuid;
  v_refund_acct     uuid;
  v_tax_acct        uuid;
  v_tips_acct       uuid;
  v_wallet_acct     uuid;
  v_gift_acct       uuid;
  v_loyalty_acct    uuid;
  v_membership_acct uuid;
  v_subs_acct       uuid;
  v_ads_acct        uuid;
  v_marketing_acct  uuid;
  v_promo_contra    uuid;
  v_promo_expense   uuid;
  v_adjust_acct     uuid;
  v_gross           numeric := COALESCE(p_row.amount, 0);
  v_platform_fee    numeric := COALESCE(p_row.net, 0);
  v_currency        text    := 'ZAR';
BEGIN
  IF p_row.transaction_type IS NULL THEN RETURN; END IF;
  IF p_row.transaction_type = 'gift_card_liability_reduction' THEN RETURN; END IF;
  IF p_row.transaction_type = 'membership_sale' AND COALESCE(v_gross, 0) = 0 THEN RETURN; END IF;

  IF p_row.transaction_type NOT IN (
    'payment','refund','tip','payout','cancellation_fee','provider_earnings',
    'service_fee','tax','travel_fee','wallet_payment','wallet_topup','gift_card_payment',
    'loyalty_redemption','promotion_discount','manual_adjustment',
    'walk_in_additional_charge','provider_subscription_payment',
    'gift_card_sale','membership_sale','provider_ads_payment',
    'additional_charge_payment','platform_fee',
    'membership_discount','loyalty_discount','provider_ads_refund',
    'provider_subscription_refund',
    'provider_marketing_credit_topup','provider_marketing_credit_refund'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_cash_acct       FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_cash_hand_acct  FROM public.gl_accounts WHERE code = '1100';
  SELECT id INTO v_payable_acct    FROM public.gl_accounts WHERE code = '2000';
  SELECT id INTO v_platform_acct   FROM public.gl_accounts WHERE code = '3000';
  SELECT id INTO v_refund_acct     FROM public.gl_accounts WHERE code = '4100';
  SELECT id INTO v_tax_acct        FROM public.gl_accounts WHERE code = '2100';
  SELECT id INTO v_tips_acct       FROM public.gl_accounts WHERE code = '2200';
  SELECT id INTO v_wallet_acct     FROM public.gl_accounts WHERE code = '2300';
  SELECT id INTO v_gift_acct       FROM public.gl_accounts WHERE code = '2400';
  SELECT id INTO v_loyalty_acct    FROM public.gl_accounts WHERE code = '2500';
  SELECT id INTO v_membership_acct FROM public.gl_accounts WHERE code = '2600';
  SELECT id INTO v_subs_acct       FROM public.gl_accounts WHERE code = '3100';
  SELECT id INTO v_ads_acct        FROM public.gl_accounts WHERE code = '3300';
  SELECT id INTO v_marketing_acct  FROM public.gl_accounts WHERE code = '3400';
  SELECT id INTO v_promo_contra    FROM public.gl_accounts WHERE code = '3500';
  SELECT id INTO v_adjust_acct     FROM public.gl_accounts WHERE code = '3900';
  SELECT id INTO v_promo_expense   FROM public.gl_accounts WHERE code = '5100';

  INSERT INTO public.journal_entries (
    provider_id, booking_id, payment_id, refund_id, source, external_ref,
    description, posted_at, reporting_currency, created_by
  ) VALUES (
    p_row.provider_id,
    p_row.booking_id,
    p_row.source_payment_id,
    p_row.source_refund_id,
    'finance_transactions',
    p_row.id::text,
    p_row.transaction_type,
    COALESCE(p_row.created_at, now()),
    'ZAR',
    'shadow-replay'
  ) RETURNING id INTO v_entry_id;

  IF p_row.transaction_type = 'payment' OR p_row.transaction_type = 'additional_charge_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  v_gross,                  v_currency, v_gross,                  'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', v_platform_fee,           v_currency, v_platform_fee,           'ZAR'),
      (v_entry_id, v_payable_acct,  'credit', v_gross - v_platform_fee, v_currency, v_gross - v_platform_fee, 'ZAR');
  ELSIF p_row.transaction_type = 'refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_refund_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'tip' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_tips_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'payout' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_payable_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'tax' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_tax_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'service_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type IN ('cancellation_fee','travel_fee','provider_earnings') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'wallet_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_wallet_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'wallet_topup' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,   'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_wallet_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'gift_card_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_gift_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'loyalty_redemption' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_loyalty_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type IN ('promotion_discount','membership_discount','loyalty_discount') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_promo_expense, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_promo_contra,  'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'manual_adjustment' THEN
    IF v_gross >= 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES
        (v_entry_id, v_cash_acct,   'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
        (v_entry_id, v_adjust_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
    ELSE
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES
        (v_entry_id, v_adjust_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
        (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
    END IF;
  ELSIF p_row.transaction_type = 'walk_in_additional_charge' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_hand_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'provider_subscription_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_subs_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'provider_subscription_refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_subs_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'gift_card_sale' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_gift_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'membership_sale' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,       'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_membership_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'provider_ads_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_ads_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'provider_ads_refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_ads_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'provider_marketing_credit_topup' THEN
    -- Prepaid marketing credit purchase: debit Cash, credit Marketing revenue.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,      'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_marketing_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'provider_marketing_credit_refund' THEN
    -- Reversal of a credit purchase: debit Marketing revenue, credit Cash.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_marketing_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,      'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSIF p_row.transaction_type = 'platform_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.shadow_post_finance_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.transaction_type NOT IN (
    'payment','refund','tip','payout','cancellation_fee','provider_earnings',
    'service_fee','tax','travel_fee','wallet_payment','wallet_topup','gift_card_payment',
    'loyalty_redemption','gift_card_liability_reduction','promotion_discount',
    'manual_adjustment','walk_in_additional_charge','provider_subscription_payment',
    'gift_card_sale','membership_sale','provider_ads_payment',
    'additional_charge_payment','platform_fee',
    'membership_discount','loyalty_discount','provider_ads_refund',
    'provider_subscription_refund',
    'provider_marketing_credit_topup','provider_marketing_credit_refund'
  ) THEN
    RAISE WARNING
      '[shadow_post_finance_transaction] unknown transaction_type=% (id=%) — not posted to journal_entries; reconciliation drift will be reported',
      NEW.transaction_type, NEW.id;
    RETURN NEW;
  END IF;

  PERFORM public._shadow_replay_finance_tx_row(NEW);
  RETURN NEW;
END;
$$;

COMMIT;
