-- 734: QA fix — patch migration 730 GL regressions
--
-- Migration 730 introduced the following critical regressions when it
-- replaced _shadow_replay_finance_tx_row in full:
--
--  1. source = 'shadow-trigger'  — revert_journal_for_finance_tx() looks for
--     source = 'finance_transactions'; payout reversals silently no-op after 730.
--  2. SECURITY DEFINER / SET search_path dropped — security regression.
--  3. GRANT EXECUTE to service_role dropped — access regression.
--  4. platform_fee GL changed to DR payable / CR revenue; should be DR cash / CR revenue
--     (customer pays the platform fee in cash).
--  5. tip GL changed to DR tips / CR payable; should be DR cash / CR tips liability
--     (tip is cash collected, held until payout).
--  6. service_fee GL changed to DR payable / CR revenue; should be DR cash / CR revenue.
--  7. provider_earnings GL was a no-op wash (DR/CR same account). Cash + payable
--     is already captured in the parent `payment` row — this type should be skipped.
--  8. promotion_discount GL changed to CR cash; should CR promo-contra (no cash out).
--  9. manual_adjustment handler used wrong type name 'manual_finance_adjustment'
--     and wrong sign logic; codebase writes 'manual_adjustment'.
-- 10. Missing handlers for tax, gift_card_payment, loyalty_redemption → ELSE branch
--     deletes the freshly-inserted journal_entry (GL drift for those types).
-- 11. gift_card_liability_reduction early-return guard was dropped → hits ELSE + delete.
-- 12. recognize_period_revenue filtered `net > 0` (legacy cash-basis rows that already
--     own their revenue) instead of `net = 0` (Phase 11 deferred rows awaiting recognition).
--
-- All Phase 11 improvements from 730 are preserved:
--   • Deferred receipt → liability for subscriptions/ads/marketing-credits
--   • Recognition rows (subscription_recognition / ads_recognition / marketing_credit_recognition)
--   • gift_card_redemption, gift_card_breakage
--   • membership_sale with gateway fees, membership_recognition, membership_provider_earnings
--   • provider_subscription_refund / provider_ads_refund / provider_marketing_credit_refund
--   • payout_transfer_fee standalone expense row

BEGIN;

-- ─── Safety: ensure 3400 (marketing-credit revenue) exists ──────────────────
INSERT INTO public.gl_accounts (code, name, type, normal_side)
VALUES ('3400', 'Marketing-credit revenue', 'revenue', 'credit')
ON CONFLICT (code) DO NOTHING;

-- ─── Corrected _shadow_replay_finance_tx_row ─────────────────────────────────
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
  -- v_platform_fee holds platform commission; named _fee for historical compat.
  v_gross            numeric := COALESCE(p_row.amount, 0);
  v_fees             numeric := COALESCE(p_row.fees,   0);
  v_platform_fee     numeric := COALESCE(p_row.net,    0);
  v_currency         text    := COALESCE(p_row.currency, 'ZAR');
BEGIN
  -- ── early returns for no-GL types ─────────────────────────────────────────
  IF p_row.transaction_type IS NULL THEN RETURN; END IF;

  -- gift_card_liability_reduction is a pure liability reclassification handled
  -- by the gift-card redemption flow; no GL entry needed here.
  IF p_row.transaction_type = 'gift_card_liability_reduction' THEN RETURN; END IF;

  -- provider_earnings is informational: cash + payable split already captured
  -- in the parent `payment` or `additional_charge_payment` row.
  IF p_row.transaction_type = 'provider_earnings' THEN RETURN; END IF;

  -- Zero-amount membership_sale is a no-op (e.g. comped membership).
  IF p_row.transaction_type = 'membership_sale' AND COALESCE(v_gross, 0) = 0 THEN RETURN; END IF;

  -- ── allowlist guard ────────────────────────────────────────────────────────
  IF p_row.transaction_type NOT IN (
    'payment', 'additional_charge_payment', 'platform_fee',
    'refund', 'provider_refund',
    'tip', 'tax', 'travel_fee', 'cancellation_fee', 'service_fee',
    'payout', 'payout_transfer_fee',
    'wallet_payment', 'wallet_topup',
    'gift_card_payment', 'gift_card_sale', 'gift_card_redemption', 'gift_card_breakage',
    'loyalty_redemption',
    'promotion_discount', 'manual_adjustment',
    'walk_in_additional_charge',
    'membership_sale', 'membership_recognition', 'membership_provider_earnings',
    'provider_subscription_payment', 'subscription_recognition', 'provider_subscription_refund',
    'provider_ads_payment', 'ads_recognition', 'provider_ads_refund',
    'provider_marketing_credit_topup', 'marketing_credit_recognition', 'provider_marketing_credit_refund'
  ) THEN
    RAISE WARNING 'shadow_post_finance_transaction: unhandled transaction_type %', p_row.transaction_type;
    RETURN;
  END IF;

  -- ── resolve account IDs ────────────────────────────────────────────────────
  SELECT id INTO v_cash_acct       FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_cash_hand_acct  FROM public.gl_accounts WHERE code = '1100';
  SELECT id INTO v_payable_acct    FROM public.gl_accounts WHERE code = '2000';
  SELECT id INTO v_tax_acct        FROM public.gl_accounts WHERE code = '2100';
  SELECT id INTO v_tips_acct       FROM public.gl_accounts WHERE code = '2200';
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

  -- ── create journal entry ───────────────────────────────────────────────────
  -- source MUST remain 'finance_transactions' so revert_journal_for_finance_tx()
  -- can locate this entry by external_ref when reversing a failed payout.
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

  -- ── journal lines by transaction type ─────────────────────────────────────

  -- payment / additional_charge_payment
  --   DR 1000 cash (gross − fees)
  --   DR 4000 gateway expense (fees, when > 0)
  --   CR 3000 platform revenue (net = commission; 0 when platform_fee row is separate)
  --   CR 2000 provider payable (gross − commission)
  IF p_row.transaction_type IN ('payment', 'additional_charge_payment') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  v_gross - v_fees,           v_currency, v_gross - v_fees,           v_currency),
      (v_entry_id, v_platform_acct, 'credit', v_platform_fee,             v_currency, v_platform_fee,             v_currency),
      (v_entry_id, v_payable_acct,  'credit', v_gross - v_platform_fee,   v_currency, v_gross - v_platform_fee,   v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  -- platform_fee — customer-paid flat fee; entirely platform revenue.
  --   DR 1000 cash / CR 3000 platform revenue
  ELSIF p_row.transaction_type = 'platform_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- refund / provider_refund
  --   DR 4100 refunds issued / CR 1000 cash
  ELSIF p_row.transaction_type IN ('refund', 'provider_refund') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_refund_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- tip — cash received from customer; held until paid out to provider.
  --   DR 1000 cash / CR 2200 tips payable
  ELSIF p_row.transaction_type = 'tip' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_tips_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- tax — collected on behalf of tax authority.
  --   DR 1000 cash / CR 2100 tax payable
  ELSIF p_row.transaction_type = 'tax' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_tax_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- service_fee — customer-paid booking/service fee; platform revenue.
  --   DR 1000 cash / CR 3000 platform revenue
  ELSIF p_row.transaction_type = 'service_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- travel_fee / cancellation_fee — pass-through to provider.
  --   DR 1000 cash / CR 2000 provider payable
  ELSIF p_row.transaction_type IN ('travel_fee', 'cancellation_fee') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- payout — paying out to provider via Paystack transfer.
  --   DR 2000 provider payable (full amount owed)
  --   CR 1000 cash (net after transfer fee)
  --   CR 4000 gateway expense (transfer fee absorbed by platform, when > 0)
  ELSIF p_row.transaction_type = 'payout' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_payable_acct, 'debit',  abs(v_gross),          v_currency, abs(v_gross),          v_currency),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'credit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  -- payout_transfer_fee — standalone fee for failed/reversed transfers where
  -- the transfer fee was still charged by the payment gateway.
  --   DR 4000 gateway expense / CR 1000 cash
  ELSIF p_row.transaction_type = 'payout_transfer_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_gateway_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- wallet_topup — customer tops up wallet via Paystack.
  --   DR 1000 cash (net of fees), DR 4000 gateway (if fees) / CR 2300 wallet liability
  ELSIF p_row.transaction_type = 'wallet_topup' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,   'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_wallet_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  -- wallet_payment — booking paid using wallet balance.
  --   DR 2300 wallet liability / CR 2000 provider payable
  ELSIF p_row.transaction_type = 'wallet_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_wallet_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- gift_card_payment — booking paid using gift card balance.
  --   DR 2400 gift card liability / CR 2000 provider payable
  ELSIF p_row.transaction_type = 'gift_card_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_gift_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- gift_card_sale — customer purchases a gift card.
  --   DR 1000 cash (net of fees), DR 4000 gateway (if fees) / CR 2400 gift card liability
  ELSIF p_row.transaction_type = 'gift_card_sale' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_gift_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  -- gift_card_redemption — gift card used for a booking (value transferred to provider).
  --   DR 2400 gift card liability / CR 2000 provider payable
  ELSIF p_row.transaction_type = 'gift_card_redemption' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_gift_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- gift_card_breakage — expired unredeemed gift card balance recognized as revenue.
  --   DR 2400 gift card liability / CR 3000 platform revenue
  ELSIF p_row.transaction_type = 'gift_card_breakage' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_gift_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- loyalty_redemption — loyalty points applied to a booking.
  --   DR 2500 loyalty liability / CR 2000 provider payable
  ELSIF p_row.transaction_type = 'loyalty_redemption' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_loyalty_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- promotion_discount — platform-funded discount (not a cash outflow to a third party).
  --   DR 5100 promo expense / CR 3500 promo contra-revenue
  ELSIF p_row.transaction_type = 'promotion_discount' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_promo_expense, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_promo_contra,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- manual_adjustment — admin-initiated ledger correction.
  --   Positive: DR 1000 cash / CR 3900 adjustment
  --   Negative: DR 3900 adjustment / CR 1000 cash
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

  -- walk_in_additional_charge — provider collects extra cash in person (not via gateway).
  --   DR 1100 cash in hand / CR 2000 provider payable
  ELSIF p_row.transaction_type = 'walk_in_additional_charge' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_hand_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- membership_sale — customer purchases a membership plan.
  --   DR 1000 cash (net of fees), DR 4000 gateway (if fees) / CR 2600 membership liability
  ELSIF p_row.transaction_type = 'membership_sale' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,       'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_membership_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  -- membership_recognition — periodic recognition of consumed membership value.
  --   DR 2600 membership liability / CR 2000 provider payable
  ELSIF p_row.transaction_type = 'membership_recognition' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_membership_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- membership_provider_earnings — provider earns their share of a membership booking.
  --   DR 2600 membership liability / CR 2000 provider payable
  ELSIF p_row.transaction_type = 'membership_provider_earnings' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_membership_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- provider_subscription_payment — Phase 11: deferred receipt.
  --   DR 1000 cash (net of fees), DR 4000 gateway (if fees) / CR 2810 deferred subscription
  ELSIF p_row.transaction_type = 'provider_subscription_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_def_subs_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  -- subscription_recognition — ratable release of deferred subscription revenue.
  --   DR 2810 deferred subscription / CR 3100 subscription revenue
  ELSIF p_row.transaction_type = 'subscription_recognition' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_subs_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_subs_acct,     'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- provider_subscription_refund — reverses the deferred liability back to cash.
  --   DR 2810 deferred subscription / CR 1000 cash
  ELSIF p_row.transaction_type = 'provider_subscription_refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_subs_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,     'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- provider_ads_payment — Phase 11: deferred ads receipt.
  --   DR 1000 cash (net of fees), DR 4000 gateway (if fees) / CR 2820 deferred ads
  ELSIF p_row.transaction_type = 'provider_ads_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_def_ads_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  -- ads_recognition — consumption-based release of deferred ads budget.
  --   DR 2820 deferred ads / CR 3300 ads revenue
  ELSIF p_row.transaction_type = 'ads_recognition' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_ads_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_ads_acct,     'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- provider_ads_refund — reverses unused deferred ads balance to cash.
  --   DR 2820 deferred ads / CR 1000 cash
  ELSIF p_row.transaction_type = 'provider_ads_refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_ads_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- provider_marketing_credit_topup — Phase 11: deferred marketing-credit receipt.
  --   DR 1000 cash (net of fees), DR 4000 gateway (if fees) / CR 2830 deferred mkt-credit
  ELSIF p_row.transaction_type = 'provider_marketing_credit_topup' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_def_mkt_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;

  -- marketing_credit_recognition — release of consumed marketing-credit budget.
  --   DR 2830 deferred mkt-credit / CR 3400 marketing-credit revenue
  ELSIF p_row.transaction_type = 'marketing_credit_recognition' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_mkt_acct,   'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_marketing_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  -- provider_marketing_credit_refund — reverses unused deferred mkt-credit to cash.
  --   DR 2830 deferred mkt-credit / CR 1000 cash
  ELSIF p_row.transaction_type = 'provider_marketing_credit_refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_mkt_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._shadow_replay_finance_tx_row(public.finance_transactions)
  TO service_role;

-- ─── Fix recognize_period_revenue: target deferred (net = 0) rows ────────────
-- The previous version filtered `net > 0` which targeted LEGACY cash-basis rows
-- that already count toward subscription_net via the aggregator fallback — this
-- would create double-counted revenue. Phase 11 deferred rows have net = 0; those
-- are the rows that need recognition rows inserted.
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
AS $$
DECLARE
  v_count          int     := 0;
  v_amount         numeric := 0;
  v_row            record;
  v_days           int;
  v_amount_per_day numeric;
  v_rec_id         uuid;
BEGIN
  -- Subscription recognition: pro-rata amount for each deferred payment whose
  -- billing term overlaps the requested period.
  FOR v_row IN
    SELECT
      ft.id                AS payment_id,
      ft.amount            AS payment_amount,
      ft.provider_id,
      ft.tenant_id,
      ft.currency,
      COALESCE(ps.billing_period_start, ft.created_at)                       AS term_start,
      COALESCE(ps.billing_period_end,   ft.created_at + interval '1 month')  AS term_end
    FROM public.finance_transactions ft
    LEFT JOIN public.provider_subscriptions ps
      ON  ps.tenant_id   = ft.tenant_id
      AND ps.provider_id = ft.provider_id
      AND ps.last_payment_at BETWEEN ft.created_at - interval '1 minute'
                                 AND ft.created_at + interval '1 minute'
    WHERE ft.tenant_id        = p_tenant_id
      AND ft.transaction_type = 'provider_subscription_payment'
      AND ft.net              = 0    -- Phase 11 deferred rows; net = 0 means revenue not yet recognized
      AND ft.created_at       < p_period_end
  LOOP
    -- Idempotent: skip if a recognition row already exists for this payment + period
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
      0,
      0,
      v_days * v_amount_per_day,
      COALESCE(v_row.currency, 'ZAR'),
      jsonb_build_object(
        'source_payment_id', v_row.payment_id,
        'period_start',      p_period_start,
        'period_end',        p_period_end,
        'days',              v_days
      ),
      p_period_start
    ) RETURNING id INTO v_rec_id;

    v_count  := v_count + 1;
    v_amount := v_amount + (v_days * v_amount_per_day);
  END LOOP;

  RETURN QUERY SELECT v_count, v_amount;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recognize_period_revenue(uuid, timestamptz, timestamptz)
  TO service_role;

COMMIT;
