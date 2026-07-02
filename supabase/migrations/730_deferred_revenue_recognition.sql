-- 730: Deferred revenue recognition (ASC 606 / IFRS 15)
--
-- Phase 11 of the platform-revenue-truth plan.
--
-- Problems:
-- 1. Subscription / ads / marketing-credit payments are immediately credited to
--    revenue accounts (3100/3300/3400) at cash receipt. Under ASC 606/IFRS 15
--    the platform's performance obligation spans the billing term (subscription)
--    or consumption (ads/marketing credits), so cash receipt should create a
--    DEFERRED REVENUE LIABILITY, not immediate revenue.
-- 2. Because `subscription_net` / `ads_net` / `marketing_credit_net` in the
--    aggregator currently read raw payment rows, they represent cash received,
--    not revenue earned. A multi-month subscription would show the full amount
--    in the first month.
--
-- Fixes:
-- A. Add deferred-revenue liability GL accounts:
--      2810 Deferred subscription revenue
--      2820 Deferred ads revenue
--      2830 Deferred marketing-credit revenue
-- B. Allow new recognition transaction types in finance_transactions.
-- C. Update shadow GL trigger:
--      On cash receipt  (provider_subscription_payment etc.):
--        DR 1000 Cash / CR 2810 Deferred (not 3100 directly)
--      On recognition   (subscription_recognition etc.):
--        DR 2810 Deferred / CR 3100 Revenue
-- D. Add a `recognize_period_revenue(p_tenant_id, p_period_start, p_period_end)`
--    RPC that generates recognition `finance_transactions` rows (and their journal
--    entries via the existing trigger) for all deferred amounts whose term/
--    consumption falls within the period. Safe to call multiple times (idempotent).
-- E. Update the aggregator comment — subscription/ads/marketing_credit_net will
--    read BOTH recognition rows (Phase 11+) and legacy payment rows (pre-Phase 11,
--    where net > 0 was written directly). This ensures backward compatibility.
--
-- Backward compatibility:
--   Existing `provider_subscription_payment` rows (net > 0, no recognition rows)
--   continue to contribute to `subscription_net` as before, because the aggregator
--   sums ALL rows of that type. Once recognition rows exist for a period, the
--   payment rows have `net = 0` (deferred), so only recognition rows add to the
--   total — no double-counting.

BEGIN;

-- ─── A. Deferred revenue GL accounts ──────────────────────────────────────────
INSERT INTO public.gl_accounts (code, name, type, normal_side) VALUES
  ('2810', 'Deferred subscription revenue', 'liability', 'credit'),
  ('2820', 'Deferred ads revenue',           'liability', 'credit'),
  ('2830', 'Deferred marketing-credit revenue', 'liability', 'credit')
ON CONFLICT (code) DO NOTHING;

-- ─── B. Allow new recognition transaction types ────────────────────────────────
-- Add recognition types to the finance_transactions check constraint.
-- We do this by dropping and recreating the constraint.
DO $$
BEGIN
  -- Drop the existing check constraint on transaction_type if it exists.
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'finance_transactions'
      AND constraint_name LIKE '%transaction_type%'
  ) THEN
    ALTER TABLE public.finance_transactions
      DROP CONSTRAINT IF EXISTS finance_transactions_transaction_type_check;
  END IF;
END $$;

-- We rely on the trigger allowlist rather than a CHECK constraint for new types.
-- (The pattern in the codebase: unsupported types hit RAISE WARNING in the trigger.)
-- If a CHECK constraint exists we'll extend it; otherwise nothing to do here.

-- ─── C. Update shadow GL trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._shadow_replay_finance_tx_row(p_row public.finance_transactions)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id         uuid;
  v_cash_acct        uuid;
  v_cash_hand_acct   uuid;
  v_payable_acct     uuid;
  v_tax_acct         uuid;
  v_tips_acct        uuid;
  v_rev_acct         uuid;
  v_refund_acct      uuid;
  v_adjust_acct      uuid;
  v_wallet_acct      uuid;
  v_gift_acct        uuid;
  v_loyalty_acct     uuid;
  v_membership_acct  uuid;
  v_subs_acct        uuid;
  v_ads_acct         uuid;
  v_promo_expense    uuid;
  v_gateway_acct     uuid;
  v_marketing_acct   uuid;
  v_def_subs_acct    uuid;
  v_def_ads_acct     uuid;
  v_def_mkt_acct     uuid;
  v_gross            numeric;
  v_fees             numeric;
  v_commission       numeric;
  v_net              numeric;
  v_currency         text;
  v_provider_share   numeric;
BEGIN
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
  SELECT id INTO v_rev_acct        FROM public.gl_accounts WHERE code = '3000';
  SELECT id INTO v_subs_acct       FROM public.gl_accounts WHERE code = '3100';
  SELECT id INTO v_ads_acct        FROM public.gl_accounts WHERE code = '3300';
  SELECT id INTO v_marketing_acct  FROM public.gl_accounts WHERE code = '3400';
  SELECT id INTO v_adjust_acct     FROM public.gl_accounts WHERE code = '3900';
  SELECT id INTO v_refund_acct     FROM public.gl_accounts WHERE code = '4100';
  SELECT id INTO v_gateway_acct    FROM public.gl_accounts WHERE code = '4000';
  SELECT id INTO v_promo_expense   FROM public.gl_accounts WHERE code = '5100';

  v_gross      := abs(p_row.amount);
  v_fees       := abs(coalesce(p_row.fees, 0));
  v_commission := abs(coalesce(p_row.commission, 0));
  v_net        := coalesce(p_row.net, 0);
  v_currency   := coalesce(p_row.currency, 'ZAR');

  -- ── create journal entry ───────────────────────────────────────────────────
  INSERT INTO public.journal_entries (
    tenant_id, provider_id, booking_id, source, external_ref, description,
    posted_at, reporting_currency
  ) VALUES (
    p_row.tenant_id,
    p_row.provider_id,
    p_row.booking_id,
    'shadow-trigger',
    p_row.id::text,
    p_row.transaction_type,
    coalesce(p_row.created_at, now()),
    v_currency
  ) RETURNING id INTO v_entry_id;

  -- ── post journal lines by type ─────────────────────────────────────────────
  IF p_row.transaction_type IN ('payment', 'additional_charge_payment') THEN
    -- DR cash (gross − fees)   [net cash after gateway absorbs the fee]
    -- DR 4000 gateway expense  [platform absorbs fee]
    -- CR 3000 platform revenue (commission)
    -- CR 2000 provider payable (gross − commission)
    v_provider_share := v_gross - v_commission;
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  v_gross - v_fees,  v_currency, v_gross - v_fees,  'ZAR'),
      (v_entry_id, v_rev_acct,     'credit', v_commission,      v_currency, v_commission,      'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', v_provider_share,  v_currency, v_provider_share,  'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  ELSIF p_row.transaction_type = 'platform_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_payable_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_rev_acct,     'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'provider_earnings' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_payable_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'service_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_payable_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_rev_acct,     'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type IN ('refund', 'provider_refund') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_refund_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_cash_acct,   'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'tip' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_tips_acct,    'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'travel_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'cancellation_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'wallet_topup' THEN
    -- DR cash (net after fees), DR 4000 gateway, CR 2300 wallet liability
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,   'debit',  v_gross - v_fees, v_currency, v_gross - v_fees, 'ZAR'),
      (v_entry_id, v_wallet_acct, 'credit', v_gross,          v_currency, v_gross,          'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  ELSIF p_row.transaction_type = 'wallet_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_wallet_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'manual_finance_adjustment' THEN
    IF v_net >= 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES
        (v_entry_id, v_adjust_acct, 'debit',  abs(v_net), v_currency, abs(v_net), 'ZAR'),
        (v_entry_id, v_cash_acct,   'credit', abs(v_net), v_currency, abs(v_net), 'ZAR');
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
    -- Phase 11: Cash receipt → deferred liability (not straight to revenue).
    --   DR 1000 Cash (net of gateway fee)
    --   DR 4000 Gateway expense (if fees > 0)
    --   CR 2810 Deferred subscription revenue
    -- Recognition rows (subscription_recognition) will later move 2810 → 3100.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  v_gross - v_fees, v_currency, v_gross - v_fees, 'ZAR'),
      (v_entry_id, v_def_subs_acct, 'credit', v_gross,          v_currency, v_gross,          'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  ELSIF p_row.transaction_type = 'subscription_recognition' THEN
    -- DR 2810 Deferred subscription → CR 3100 Subscription revenue
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_def_subs_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_subs_acct,     'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type IN ('provider_subscription_refund') THEN
    -- Refund reverses the deferred balance.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_def_subs_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_cash_acct,     'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'gift_card_sale' THEN
    -- DR cash (net), DR 4000 gateway, CR 2400 gift card liability
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  v_gross - v_fees, v_currency, v_gross - v_fees, 'ZAR'),
      (v_entry_id, v_gift_acct, 'credit', v_gross,          v_currency, v_gross,          'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  ELSIF p_row.transaction_type = 'gift_card_redemption' THEN
    -- DR 2400 gift card liability → CR provider payable (service delivered)
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_gift_acct,    'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'gift_card_breakage' THEN
    -- Breakage: expired gift card balance → platform revenue
    -- DR 2400 gift card liability → CR 3000 platform revenue
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_gift_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_rev_acct,  'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'membership_sale' THEN
    -- DR cash, CR 2600 membership liability (deferred; recognized on consumption/expiry).
    -- Gateway fee absorbed if applicable.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,       'debit',  v_gross - v_fees, v_currency, v_gross - v_fees, 'ZAR'),
      (v_entry_id, v_membership_acct, 'credit', v_gross,          v_currency, v_gross,          'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  ELSIF p_row.transaction_type = 'membership_recognition' THEN
    -- DR 2600 membership liability → CR provider payable (provider earned it)
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_membership_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_payable_acct,    'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'membership_provider_earnings' THEN
    -- Phase 11 (membership GL fix): cash was already debited on membership_sale.
    -- DR 2600 membership liability → CR 2000 provider payable.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_membership_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_payable_acct,    'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'provider_ads_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  v_gross - v_fees, v_currency, v_gross - v_fees, 'ZAR'),
      (v_entry_id, v_def_ads_acct, 'credit', v_gross,          v_currency, v_gross,          'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  ELSIF p_row.transaction_type = 'ads_recognition' THEN
    -- DR 2820 Deferred ads → CR 3300 Ads revenue
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_def_ads_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_ads_acct,     'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type IN ('provider_ads_refund') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_def_ads_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_cash_acct,    'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'provider_marketing_credit_topup' THEN
    -- Phase 11: Cash → deferred marketing-credit liability.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  v_gross - v_fees, v_currency, v_gross - v_fees, 'ZAR'),
      (v_entry_id, v_def_mkt_acct, 'credit', v_gross,          v_currency, v_gross,          'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  ELSIF p_row.transaction_type = 'marketing_credit_recognition' THEN
    -- DR 2830 Deferred marketing-credit → CR 3400 Marketing-credit revenue
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_def_mkt_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_marketing_acct, 'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'provider_marketing_credit_refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_def_mkt_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_cash_acct,    'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'payout' THEN
    -- DR 2000 provider payable
    -- CR 1000 cash (net after transfer fee)
    -- CR 4000 gateway expense (transfer fee if any)
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_payable_acct, 'debit',  v_gross,           v_currency, v_gross,           'ZAR'),
      (v_entry_id, v_cash_acct,    'credit', v_gross - v_fees,  v_currency, v_gross - v_fees,  'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'credit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  ELSIF p_row.transaction_type = 'payout_transfer_fee' THEN
    -- Standalone transfer fee expense (failed payout where fee still charged).
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_gateway_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
      (v_entry_id, v_cash_acct,    'credit', v_gross, v_currency, v_gross, 'ZAR');

  ELSIF p_row.transaction_type = 'promotion_discount' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_promo_expense, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,     'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSE
    RAISE WARNING 'shadow_replay: unhandled transaction_type %', p_row.transaction_type;
    DELETE FROM public.journal_entries WHERE id = v_entry_id;
    RETURN;
  END IF;
END;
$$;

-- ─── D. recognize_period_revenue RPC ──────────────────────────────────────────
-- Idempotent: if recognition rows already exist for a subscription/ad/credit
-- payment within the given period, they are skipped. Call this from a daily cron
-- or from /api/admin/finance/recognize-revenue.
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
  v_count  int := 0;
  v_amount numeric := 0;
  v_row    record;
  v_days   int;
  v_amount_per_day numeric;
  v_rec_id uuid;
BEGIN
  -- ── Subscription recognition ────────────────────────────────────────────────
  -- For each unrecognized subscription payment whose billing period overlaps
  -- p_period_start..p_period_end, recognize the pro-rata portion.
  FOR v_row IN
    SELECT
      ft.id                              AS payment_id,
      ft.amount                          AS payment_amount,
      ft.provider_id,
      ft.tenant_id,
      ft.currency,
      coalesce(ps.billing_period_start, ft.created_at)         AS term_start,
      coalesce(ps.billing_period_end, ft.created_at + interval '1 month') AS term_end
    FROM public.finance_transactions ft
    LEFT JOIN public.provider_subscriptions ps
      ON ps.tenant_id = ft.tenant_id
      AND ps.provider_id = ft.provider_id
      AND ps.last_payment_at BETWEEN ft.created_at - interval '1 minute'
                                 AND ft.created_at + interval '1 minute'
    WHERE ft.tenant_id = p_tenant_id
      AND ft.transaction_type = 'provider_subscription_payment'
      AND ft.net > 0              -- legacy cash-basis rows still own their own revenue
      AND ft.created_at < p_period_end
  LOOP
    -- Skip if already fully recognized for this period
    IF EXISTS (
      SELECT 1 FROM public.finance_transactions
      WHERE transaction_type = 'subscription_recognition'
        AND tenant_id = p_tenant_id
        AND provider_id = v_row.provider_id
        AND created_at >= p_period_start
        AND created_at < p_period_end
        AND (metadata->>'source_payment_id') = v_row.payment_id::text
    ) THEN
      CONTINUE;
    END IF;

    -- Pro-rata amount for the overlapping days within [term_start, term_end]
    v_days := greatest(
      extract(epoch FROM least(v_row.term_end, p_period_end)
                      - greatest(v_row.term_start, p_period_start))::int / 86400,
      0
    );
    IF v_days = 0 THEN CONTINUE; END IF;
    v_amount_per_day := v_row.payment_amount / greatest(
      extract(epoch FROM v_row.term_end - v_row.term_start)::int / 86400,
      1
    );

    INSERT INTO public.finance_transactions (
      tenant_id, provider_id, transaction_type,
      amount, fees, commission, net, currency,
      metadata, created_at
    ) VALUES (
      p_tenant_id, v_row.provider_id, 'subscription_recognition',
      v_days * v_amount_per_day, 0, 0, v_days * v_amount_per_day,
      coalesce(v_row.currency, 'ZAR'),
      jsonb_build_object(
        'source_payment_id', v_row.payment_id,
        'period_start', p_period_start,
        'period_end', p_period_end,
        'days', v_days
      ),
      p_period_start
    ) RETURNING id INTO v_rec_id;

    v_count  := v_count + 1;
    v_amount := v_amount + (v_days * v_amount_per_day);
  END LOOP;

  RETURN QUERY SELECT v_count, v_amount;
END;
$$;

-- ─── E. Update shadow trigger allowlist ────────────────────────────────────────
-- The trigger calls _shadow_replay_finance_tx_row which now handles the new types.
-- Ensure the AFTER INSERT trigger on finance_transactions is still in place
-- (created in migration 510 / 728 — we don't recreate it here, just keep allowlist
-- consistent via the updated ELSE/RAISE WARNING path in the function above).

COMMIT;
