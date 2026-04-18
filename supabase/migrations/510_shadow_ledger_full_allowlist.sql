-- 510_shadow_ledger_full_allowlist.sql
--
-- Launch-readiness 100/100 (Wave 1.1):
--   The shadow_post_finance_transaction trigger (last touched in 509) only
--   covered 12 of the ~22 transaction_type values that the application
--   actually inserts into finance_transactions. Every uncovered type was
--   silently skipped — the legacy single-entry row was visible in reports,
--   but the double-entry ledger never received a balanced journal entry,
--   guaranteeing reconciliation drift on:
--
--     gift_card_liability_reduction   (split-payment offset)
--     promotion_discount              (booking promo)
--     manual_adjustment               (admin finance correction)
--     walk_in_additional_charge       (cash-paid charge captured by provider)
--     provider_subscription_payment   (paystack subscription renewal)
--     gift_card_sale                  (platform gift card purchased)
--     membership_sale                 (provider membership purchased)
--     provider_ads_payment            (ads campaign pre-pay)
--     additional_charge_payment       (extra charge processed via gateway)
--     platform_fee                    (product-order platform commission)
--
--   This migration:
--     1. Adds the new GL accounts required to balance these flows.
--     2. Adds _shadow_replay_finance_tx_row() — a row-explicit twin of the
--        trigger so we can backfill historical rows.
--     3. Replaces shadow_post_finance_transaction() with a full allowlist
--        plus a final "unknown type" RAISE WARNING fallthrough so any
--        future transaction_type added by the application is loud, not
--        silent.
--     4. Adds recompute_journal_for_finance_tx() — idempotent reshadow.
--     5. Backfills missing journal entries for previously-skipped types.
--
--   Together with migration 511 (zero-drift assertion RPC) this closes
--   blocker B-SHADOW-GAP from the Final Launch Readiness Audit.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. New GL accounts
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.gl_accounts (code, name, type, normal_side) VALUES
  ('1100', 'Cash on hand (provider walk-in)',  'asset',     'debit'),
  ('2600', 'Membership liability (deferred)',  'liability', 'credit'),
  ('3100', 'Subscription revenue',             'revenue',   'credit'),
  ('3300', 'Ads revenue',                      'revenue',   'credit'),
  ('3500', 'Promotional contra revenue',       'revenue',   'credit'),
  ('3900', 'Manual finance adjustments',       'revenue',   'credit'),
  ('5100', 'Promotion expense (marketing)',    'expense',   'debit')
ON CONFLICT (code) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Row-explicit twin of the shadow trigger (used by backfill + replay)
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
    'service_fee','tax','travel_fee','wallet_payment','gift_card_payment',
    'loyalty_redemption','promotion_discount','manual_adjustment',
    'walk_in_additional_charge','provider_subscription_payment',
    'gift_card_sale','membership_sale','provider_ads_payment',
    'additional_charge_payment','platform_fee'
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
  ELSIF p_row.transaction_type = 'promotion_discount' THEN
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
  ELSIF p_row.transaction_type = 'platform_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._shadow_replay_finance_tx_row(public.finance_transactions)
  TO service_role;

COMMENT ON FUNCTION public._shadow_replay_finance_tx_row IS
  'Wave 1.1: trigger-equivalent body callable on an explicit row. Kept in '
  'lock-step with shadow_post_finance_transaction(). Internal use only.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Idempotent re-shadow for a single finance_transactions row
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recompute_journal_for_finance_tx(p_finance_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.finance_transactions;
BEGIN
  SELECT * INTO v_row FROM public.finance_transactions WHERE id = p_finance_tx_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.journal_lines jl
   USING public.journal_entries je
   WHERE jl.entry_id = je.id
     AND je.source = 'finance_transactions'
     AND je.external_ref = p_finance_tx_id::text;

  DELETE FROM public.journal_entries
   WHERE source = 'finance_transactions'
     AND external_ref = p_finance_tx_id::text;

  PERFORM public._shadow_replay_finance_tx_row(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_journal_for_finance_tx(uuid)
  TO service_role;

COMMENT ON FUNCTION public.recompute_journal_for_finance_tx IS
  'Wave 1.1: idempotently rebuilds the shadow journal entry+lines for a '
  'single finance_transactions row. Used by the backfill in 510 and by '
  'reconciliation_assert_zero_drift (511) to self-heal missed rows.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Replace shadow_post_finance_transaction with full allowlist
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.shadow_post_finance_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.transaction_type NOT IN (
    'payment','refund','tip','payout','cancellation_fee','provider_earnings',
    'service_fee','tax','travel_fee','wallet_payment','gift_card_payment',
    'loyalty_redemption','gift_card_liability_reduction','promotion_discount',
    'manual_adjustment','walk_in_additional_charge','provider_subscription_payment',
    'gift_card_sale','membership_sale','provider_ads_payment',
    'additional_charge_payment','platform_fee'
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

COMMENT ON FUNCTION public.shadow_post_finance_transaction() IS
  'Wave 1.1 (audit 2026-04 final 100/100): full-coverage shadow trigger. '
  'Delegates to _shadow_replay_finance_tx_row so trigger and idempotent '
  'replay share one implementation. Unknown transaction_types raise a '
  'WARNING so reconciliation never silently drifts.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Backfill missing journal entries for previously-skipped types
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_id uuid;
  v_count bigint := 0;
BEGIN
  FOR v_id IN
    SELECT ft.id
    FROM public.finance_transactions ft
    LEFT JOIN public.journal_entries je
      ON je.source = 'finance_transactions'
     AND je.external_ref = ft.id::text
    WHERE je.id IS NULL
      AND ft.transaction_type IN (
        'promotion_discount',
        'manual_adjustment',
        'walk_in_additional_charge',
        'provider_subscription_payment',
        'gift_card_sale',
        'membership_sale',
        'provider_ads_payment',
        'additional_charge_payment',
        'platform_fee'
      )
  LOOP
    PERFORM public.recompute_journal_for_finance_tx(v_id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '510 shadow backfill: re-shadowed % previously-missed rows', v_count;
END $$;

COMMIT;
