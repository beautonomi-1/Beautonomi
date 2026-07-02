-- 729: Multi-currency — add currency column to finance_transactions and payment_transactions
--
-- Phase 6 of the platform-revenue-truth plan.
--
-- The ledger tables have no currency column. Every aggregation silently assumes
-- a single currency (ZAR is hardcoded in the shadow GL). A multi-currency
-- tenant (or a future expansion to NG/GH/KE) would produce invalid cross-
-- currency totals with no indication of the error.
--
-- This migration:
--   1. Adds a nullable `currency` column to finance_transactions (backfill deferred —
--      existing rows keep NULL; TS code reads NULL as the tenant's default currency).
--   2. Adds a nullable `currency` column to payment_transactions (same).
--   3. Adds an index for per-currency reporting queries.
--   4. Updates the shadow GL trigger to pass the row's currency rather than
--      hardcoding 'ZAR'.
--
-- Application-layer follow-up (in TS, same phase):
--   - All finance_transactions inserts set currency from booking/tenant config.
--   - aggregateFinanceLedgerRows groups by currency or asserts single-currency.
--   - The FinanceLedgerRow type gains a `currency?: string` field.

BEGIN;

-- ─── 1. currency columns ─────────────────────────────────────────────────────
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS currency TEXT;

COMMENT ON COLUMN public.finance_transactions.currency IS
  'ISO 4217 currency code for all monetary columns (amount, fees, commission, net). '
  'NULL on legacy rows means the tenant default currency (typically ZAR).';

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS currency TEXT;

COMMENT ON COLUMN public.payment_transactions.currency IS
  'ISO 4217 currency code for amount, fees, net_amount. '
  'NULL on legacy rows means the tenant default currency.';

-- ─── 2. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_finance_transactions_currency
  ON public.finance_transactions(tenant_id, currency, created_at DESC)
  WHERE currency IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_currency
  ON public.payment_transactions(currency, created_at DESC)
  WHERE currency IS NOT NULL;

-- ─── 3. Update shadow GL to use row's currency ───────────────────────────────
-- Replace the hardcoded 'ZAR' v_currency with COALESCE(row.currency, 'ZAR') in
-- _shadow_replay_finance_tx_row(). We patch only the currency variable; the rest
-- of the function body stays identical to migration 728.

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
  v_gateway_acct    uuid;
  v_gross           numeric := COALESCE(p_row.amount, 0);
  v_fees            numeric := COALESCE(p_row.fees,   0);
  v_platform_fee    numeric := COALESCE(p_row.net,    0);
  -- Use the row's currency; fall back to ZAR only as a last resort so legacy
  -- rows stay backward-compatible.
  v_currency        text    := COALESCE(p_row.currency, 'ZAR');
BEGIN
  IF p_row.transaction_type IS NULL THEN RETURN; END IF;
  IF p_row.transaction_type = 'gift_card_liability_reduction' THEN RETURN; END IF;
  IF p_row.transaction_type = 'membership_sale' AND COALESCE(v_gross, 0) = 0 THEN RETURN; END IF;

  IF p_row.transaction_type NOT IN (
    'payment','refund','tip','payout','payout_transfer_fee',
    'cancellation_fee','provider_earnings',
    'service_fee','tax','travel_fee','wallet_payment','wallet_topup','gift_card_payment',
    'loyalty_redemption','promotion_discount','manual_adjustment',
    'walk_in_additional_charge','provider_subscription_payment',
    'gift_card_sale','membership_sale','provider_ads_payment',
    'additional_charge_payment','platform_fee'
  ) THEN
    RAISE WARNING 'shadow_post_finance_transaction: unhandled transaction_type %', p_row.transaction_type;
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
  SELECT id INTO v_gateway_acct    FROM public.gl_accounts WHERE code = '4000';

  INSERT INTO public.journal_entries (
    provider_id, booking_id, payment_id, refund_id, source, external_ref,
    description, posted_at, reporting_currency, created_by
  ) VALUES (
    p_row.provider_id, p_row.booking_id, p_row.source_payment_id, p_row.source_refund_id,
    'finance_transactions', p_row.id::text, p_row.transaction_type,
    COALESCE(p_row.created_at, now()), v_currency, 'shadow-replay'
  ) RETURNING id INTO v_entry_id;

  IF p_row.transaction_type IN ('payment', 'additional_charge_payment') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  v_gross - v_fees,         v_currency, v_gross - v_fees,         v_currency),
      (v_entry_id, v_platform_acct, 'credit', v_platform_fee,           v_currency, v_platform_fee,           v_currency),
      (v_entry_id, v_payable_acct,  'credit', v_gross - v_platform_fee, v_currency, v_gross - v_platform_fee, v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;
  ELSIF p_row.transaction_type = 'refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_refund_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
  ELSIF p_row.transaction_type = 'tip' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_tips_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
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
  ELSIF p_row.transaction_type = 'tax' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_tax_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
  ELSIF p_row.transaction_type = 'service_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
  ELSIF p_row.transaction_type IN ('cancellation_fee','travel_fee','provider_earnings') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
  ELSIF p_row.transaction_type = 'wallet_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_wallet_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
  ELSIF p_row.transaction_type = 'wallet_topup' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,   'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_wallet_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;
  ELSIF p_row.transaction_type = 'gift_card_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_gift_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
  ELSIF p_row.transaction_type = 'loyalty_redemption' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_loyalty_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
  ELSIF p_row.transaction_type = 'promotion_discount' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_promo_expense, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_promo_contra,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
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
  ELSIF p_row.transaction_type = 'provider_subscription_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_subs_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;
  ELSIF p_row.transaction_type = 'gift_card_sale' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_gift_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;
  ELSIF p_row.transaction_type = 'membership_sale' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,       'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_membership_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
  ELSIF p_row.transaction_type = 'provider_ads_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, v_currency),
      (v_entry_id, v_ads_acct,  'credit', abs(v_gross),          v_currency, abs(v_gross),          v_currency);
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, v_currency);
    END IF;
  ELSIF p_row.transaction_type = 'platform_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._shadow_replay_finance_tx_row(public.finance_transactions)
  TO service_role;

COMMIT;
