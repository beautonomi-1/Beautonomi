-- 728: GL completeness — post gateway fees to GL 4000, fix payout reversal
--
-- Phase 5 of the platform-revenue-truth plan.
--
-- Problems in migration 510's shadow ledger:
-- 1. `payment` / `additional_charge_payment` rows carry real gateway fees in
--    their `fees` column, but the GL posting never touches GL 4000. So
--    `ledger_platform_revenue()` reports gateway fees = 0 even though the
--    platform absorbs them. The P&L overstates platform net.
-- 2. When a completed payout is reversed (`transfer.failed` after `transfer.success`),
--    the application deletes the `finance_transactions` row but the INSERT-only
--    shadow trigger leaves the journal entry orphaned → GL drift.
-- 3. `payout_transfer_fee` (new transaction_type from Phase 4) is not in the
--    allowlist — it would hit the RAISE WARNING fallthrough.
--
-- Fixes:
-- A. Add GL 4000 (Gateway fee expense) account.
-- B. Fix `payment` / `additional_charge_payment` GL entry to:
--      DR cash (amount − fees)
--      DR 4000 gateway expense (fees)
--      CR platform revenue (commission)
--      CR provider payable (amount − commission)
--    When fees = 0 the extra line is skipped so existing zero-fee rows keep
--    their original two-line balanced entries.
-- C. Fix `payout` entry to split the cash credit:
--      DR 2000 provider payable (amount)
--      CR 1000 cash (amount − fees)     [net cash out after transfer fee]
--      CR 4000 gateway expense (fees)   [transfer fee = platform cost]
-- D. Add a `revert_journal_for_finance_tx(p_finance_tx_id uuid)` helper that
--    posts a reversing journal entry rather than deleting rows. Call it from
--    the transfer-reversed path in transfer-events.ts instead of DELETE.
-- E. Add `payout_transfer_fee` to the allowlist.

BEGIN;

-- ─── A. GL account 4000 ──────────────────────────────────────────────────────
INSERT INTO public.gl_accounts (code, name, type, normal_side)
VALUES ('4000', 'Gateway fee expense', 'expense', 'debit')
ON CONFLICT (code) DO NOTHING;

-- ─── B/C/D/E. Rebuild _shadow_replay_finance_tx_row() ────────────────────────
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
  v_currency        text    := 'ZAR';
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

  -- ── payment / additional_charge_payment ────────────────────────────────────
  -- With gateway fees (Phase 5):
  --   DR cash (amount − fees)
  --   DR gateway_expense_4000 (fees)        [new when fees > 0]
  --   CR platform_revenue (net = commission)
  --   CR provider_payable (amount − net)
  -- Totals: (amount − fees) + fees = amount = net + (amount − net). Balanced.
  IF p_row.transaction_type IN ('payment', 'additional_charge_payment') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  v_gross - v_fees,         v_currency, v_gross - v_fees,         'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', v_platform_fee,           v_currency, v_platform_fee,           'ZAR'),
      (v_entry_id, v_payable_acct,  'credit', v_gross - v_platform_fee, v_currency, v_gross - v_platform_fee, 'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  -- ── refund ──────────────────────────────────────────────────────────────────
  ELSIF p_row.transaction_type = 'refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_refund_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  -- ── tip ─────────────────────────────────────────────────────────────────────
  ELSIF p_row.transaction_type = 'tip' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_tips_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  -- ── payout ──────────────────────────────────────────────────────────────────
  -- With transfer fee (Phase 5):
  --   DR 2000 provider payable (amount)
  --   CR 1000 cash (amount − fees)           [net cash leaving bank]
  --   CR 4000 gateway expense (fees)         [transfer fee platform absorbs]
  -- When fees = 0: reverts to original two-line entry.
  ELSIF p_row.transaction_type = 'payout' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_payable_acct, 'debit',  abs(v_gross),          v_currency, abs(v_gross),          'ZAR'),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, 'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'credit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  -- ── payout_transfer_fee ─────────────────────────────────────────────────────
  -- Standalone expense row for failed/reversed transfer fees.
  --   DR 4000 gateway expense (amount)
  --   CR 1000 cash (amount)
  ELSIF p_row.transaction_type = 'payout_transfer_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_gateway_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
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
      (v_entry_id, v_cash_acct,   'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, 'ZAR'),
      (v_entry_id, v_wallet_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

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
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, 'ZAR'),
      (v_entry_id, v_subs_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  ELSIF p_row.transaction_type = 'gift_card_sale' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, 'ZAR'),
      (v_entry_id, v_gift_acct, 'credit', abs(v_gross),          v_currency, abs(v_gross),          'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

  ELSIF p_row.transaction_type = 'membership_sale' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,       'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_membership_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF p_row.transaction_type = 'provider_ads_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross) - v_fees, v_currency, abs(v_gross) - v_fees, 'ZAR'),
      (v_entry_id, v_ads_acct,  'credit', abs(v_gross),          v_currency, abs(v_gross),          'ZAR');
    IF v_fees > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
      VALUES (v_entry_id, v_gateway_acct, 'debit', v_fees, v_currency, v_fees, 'ZAR');
    END IF;

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

-- ─── D. revert_journal_for_finance_tx() ──────────────────────────────────────
-- Posts a reversing journal entry for the given finance_transactions row.
-- Use this instead of DELETE on the shadow journal when reverting a completed
-- payout (transfer.reversed) so no journal entry is ever orphaned.
CREATE OR REPLACE FUNCTION public.revert_journal_for_finance_tx(p_finance_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_entry  uuid;
  v_reversal_id   uuid;
BEGIN
  SELECT id INTO v_source_entry
  FROM public.journal_entries
  WHERE source = 'finance_transactions'
    AND external_ref = p_finance_tx_id::text
  ORDER BY posted_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  -- Insert a reversing journal entry
  INSERT INTO public.journal_entries (
    source, external_ref, description, posted_at, reporting_currency, created_by
  ) VALUES (
    'finance_transactions_reversal',
    p_finance_tx_id::text,
    'Reversal of journal entry for finance_tx ' || p_finance_tx_id::text,
    now(),
    'ZAR',
    'shadow-reversal'
  ) RETURNING id INTO v_reversal_id;

  -- Mirror every line with flipped sides (debit ↔ credit)
  INSERT INTO public.journal_lines (
    entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency
  )
  SELECT
    v_reversal_id,
    account_id,
    CASE WHEN side = 'debit' THEN 'credit' ELSE 'debit' END,
    raw_amount,
    raw_currency,
    reporting_amount,
    reporting_currency
  FROM public.journal_lines
  WHERE entry_id = v_source_entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_journal_for_finance_tx(uuid)
  TO service_role;

COMMIT;
