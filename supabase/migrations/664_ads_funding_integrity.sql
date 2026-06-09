-- ============================================================================
-- Migration 664: Ads funding integrity + reversal accounting
-- ============================================================================
-- Hardens the provider paid-ads system so a campaign can NEVER serve without
-- a verified, non-reversed payment, and so any reversal (failed-after-success,
-- refund, chargeback) fully unwinds both serving and the finance ledger.
--
--  1. Funding columns: ads_campaigns.funded_at + paid_order_id. A campaign is
--     "fundable to serve" only when funded_at IS NOT NULL. The auction and the
--     public event recorder gate on this in addition to status = 'active'.
--  2. Reversal accounting: add `provider_ads_refund` to the shadow double-entry
--     ledger allowlist with a reversing journal (debit ads revenue, credit cash)
--     so a refund nets the GL back to zero. The operational finance_transactions
--     row is posted with a NEGATIVE amount; the journal uses abs() like every
--     other reversal type (refund/payout), so the double entry stays balanced.
--  3. expire_overspent_ads_campaigns(): the cron already calls this RPC but it
--     was never defined (the route fell back to a manual scan). Define it so the
--     primary path works and stays consistent.
--  4. Backfill funded_at/paid_order_id for already-active campaigns that have a
--     paid budget order, so the new serve-time guard doesn't hide live, paid ads.
--
-- Single source of truth: a sponsored campaign serves IFF
--   status = 'active' AND funded_at IS NOT NULL AND (budget/time window remains).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Part 1: funding columns on ads_campaigns
-- ---------------------------------------------------------------------------
ALTER TABLE public.ads_campaigns
  ADD COLUMN IF NOT EXISTS funded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_order_id UUID REFERENCES public.ads_budget_orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ads_campaigns.funded_at IS
  '664: set when a paid ads_budget_order funds this campaign; cleared on reversal. '
  'A campaign only serves while funded_at IS NOT NULL (serve-time guard).';
COMMENT ON COLUMN public.ads_campaigns.paid_order_id IS
  '664: the ads_budget_order that funded the current run; cleared on reversal.';

-- Serve-time guard reads active + funded; index the hot path.
CREATE INDEX IF NOT EXISTS idx_ads_campaigns_active_funded
  ON public.ads_campaigns (status, funded_at)
  WHERE status = 'active' AND funded_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Part 2: shadow ledger — recognise `provider_ads_refund` (reversal)
-- ---------------------------------------------------------------------------
-- Reproduces the 655 function bodies verbatim with `provider_ads_refund` added
-- to both allowlists and a new ELSIF branch in the replay twin. The refund is
-- the exact reverse of provider_ads_payment: debit Ads revenue (3300), credit
-- Cash (1000), using abs() so a negative finance_transactions.amount still posts
-- a balanced, reversing journal entry.

INSERT INTO public.gl_accounts (code, name, type, normal_side) VALUES
  ('3300', 'Ads revenue', 'revenue', 'credit')
ON CONFLICT (code) DO NOTHING;

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
    'membership_discount','loyalty_discount','provider_ads_refund'
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
    -- Reversal of provider_ads_payment: debit Ads revenue, credit Cash.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_ads_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
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
    'membership_discount','loyalty_discount','provider_ads_refund'
  ) THEN
    RAISE WARNING
      '[shadow_post_finance_transaction] unknown transaction_type=% (id=%) — not posted to journal_entries; reconciliation drift will be reported',
      NEW.transaction_type, NEW.id;
    RETURN NEW;
  END IF;

  -- Defer to the row-explicit twin so trigger and replay share one body.
  PERFORM public._shadow_replay_finance_tx_row(NEW);
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Part 3: expire_overspent_ads_campaigns() — the cron's primary RPC
-- ---------------------------------------------------------------------------
-- Ends active CPC campaigns whose spend has reached their funded budget.
-- Returns the number of campaigns ended so the cron can report rpc vs fallback.
CREATE OR REPLACE FUNCTION public.expire_overspent_ads_campaigns()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH ended AS (
    UPDATE public.ads_campaigns
    SET status = 'ended', updated_at = NOW()
    WHERE status = 'active'
      AND billing_model = 'cpc_budget'
      AND budget > 0
      AND spent >= budget
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM ended;
  RETURN COALESCE(v_count, 0);
END;
$$;

COMMENT ON FUNCTION public.expire_overspent_ads_campaigns() IS
  '664: end active CPC ad campaigns whose spend has reached their funded budget. '
  'Called by /api/cron/expire-ads-campaigns (manual scan remains as a fallback).';

GRANT EXECUTE ON FUNCTION public.expire_overspent_ads_campaigns() TO service_role;

-- ---------------------------------------------------------------------------
-- Part 4: backfill funded_at/paid_order_id for live, paid campaigns
-- ---------------------------------------------------------------------------
-- Any campaign that is currently active (or paused) with a budget > 0 was funded
-- by a paid budget order under the old flow. Stamp funded_at + paid_order_id so
-- the new serve-time guard keeps these live ads serving.
WITH latest_paid AS (
  SELECT DISTINCT ON (o.campaign_id)
    o.campaign_id,
    o.id AS order_id,
    COALESCE(o.paid_at, o.updated_at, o.created_at) AS paid_ts
  FROM public.ads_budget_orders o
  WHERE o.status = 'paid'
  ORDER BY o.campaign_id, COALESCE(o.paid_at, o.updated_at, o.created_at) DESC
)
UPDATE public.ads_campaigns c
SET funded_at = COALESCE(c.funded_at, lp.paid_ts, NOW()),
    paid_order_id = COALESCE(c.paid_order_id, lp.order_id)
FROM latest_paid lp
WHERE c.id = lp.campaign_id
  AND c.funded_at IS NULL
  AND c.status IN ('active', 'paused')
  AND c.budget > 0;

COMMIT;
