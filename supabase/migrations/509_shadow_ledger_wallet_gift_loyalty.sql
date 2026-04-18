-- 509_shadow_ledger_wallet_gift_loyalty.sql
--
-- Final-audit 2026-04 follow-up (R6):
-- Widens the shadow (double-entry) posting trigger so that wallet
-- payments, gift card redemptions, and loyalty redemptions also land in
-- `journal_entries` / `journal_lines`. Previously they were recorded in
-- `finance_transactions` but silently skipped by `shadow_post_finance_transaction`
-- (migration 505 allowlist did not include them), which caused the
-- double-entry ledger to diverge from the single-entry ledger whenever
-- a customer paid fully from wallet / gift card / loyalty points.
--
-- This migration:
--   1. Adds new GL accounts for the three new liability buckets
--      (2300 wallet liability, 2400 gift card liability, 2500 loyalty
--      liability / platform-borne marketing expense).
--   2. Replaces `public.shadow_post_finance_transaction()` with a
--      version that recognises `wallet_payment`, `gift_card_payment`,
--      and `loyalty_redemption` in addition to the existing allowlist.
--   3. Leaves the existing branches untouched; only new ELSIF arms are
--      appended, so this is strictly additive.
--
-- Journal posting semantics:
--   wallet_payment      → DR wallet liability (2300), CR provider payable (2000)
--                         (customer wallet balance goes down, provider is owed)
--   gift_card_payment   → DR gift card liability (2400), CR provider payable (2000)
--   loyalty_redemption  → DR loyalty liability (2500), CR provider payable (2000)
--                         (platform-borne: customer paid 0 cash, platform "owes"
--                          the provider the redeemed amount out of the loyalty
--                          liability bucket)
--
-- If product policy later decides loyalty is provider-borne (i.e. the
-- provider absorbs the cost), a follow-up migration should flip the DR
-- account for `loyalty_redemption` from `2500` to a provider-revenue
-- contra account. For now we preserve "platform pays" behaviour that
-- matches current `validate-booking.ts` and `process-payment.ts`.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. New GL accounts
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.gl_accounts (code, name, type, normal_side) VALUES
  ('2300', 'Customer wallet liability',   'liability', 'credit'),
  ('2400', 'Gift card liability',         'liability', 'credit'),
  ('2500', 'Loyalty redemption liability','liability', 'credit')
ON CONFLICT (code) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Replace shadow_post_finance_transaction with widened allowlist
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.shadow_post_finance_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id       uuid;
  v_cash_acct      uuid;
  v_payable_acct   uuid;
  v_platform_acct  uuid;
  v_refund_acct    uuid;
  v_tax_acct       uuid;
  v_tips_acct      uuid;
  v_wallet_acct    uuid;
  v_gift_acct      uuid;
  v_loyalty_acct   uuid;
  v_gross          numeric := COALESCE(NEW.amount, 0);
  v_platform_fee   numeric := COALESCE(NEW.net, 0);
  v_currency       text    := 'ZAR';
BEGIN
  -- R6 (audit 2026-04 final pass): widened allowlist to include the
  -- three zero-gateway payment types. Still a hard whitelist so that
  -- unknown transaction types never silently post partial entries.
  IF NEW.transaction_type NOT IN (
    'payment',
    'refund',
    'tip',
    'payout',
    'cancellation_fee',
    'provider_earnings',
    'service_fee',
    'tax',
    'travel_fee',
    'wallet_payment',
    'gift_card_payment',
    'loyalty_redemption'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cash_acct     FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_payable_acct  FROM public.gl_accounts WHERE code = '2000';
  SELECT id INTO v_platform_acct FROM public.gl_accounts WHERE code = '3000';
  SELECT id INTO v_refund_acct   FROM public.gl_accounts WHERE code = '4100';
  SELECT id INTO v_tax_acct      FROM public.gl_accounts WHERE code = '2100';
  SELECT id INTO v_tips_acct     FROM public.gl_accounts WHERE code = '2200';
  SELECT id INTO v_wallet_acct   FROM public.gl_accounts WHERE code = '2300';
  SELECT id INTO v_gift_acct     FROM public.gl_accounts WHERE code = '2400';
  SELECT id INTO v_loyalty_acct  FROM public.gl_accounts WHERE code = '2500';

  INSERT INTO public.journal_entries (
    provider_id, booking_id, payment_id, refund_id, source, external_ref,
    description, posted_at, reporting_currency, created_by
  ) VALUES (
    NEW.provider_id,
    NEW.booking_id,
    NEW.source_payment_id,
    NEW.source_refund_id,
    'finance_transactions',
    NEW.id::text,
    NEW.transaction_type,
    COALESCE(NEW.created_at, now()),
    'ZAR',
    'shadow-trigger'
  ) RETURNING id INTO v_entry_id;

  IF NEW.transaction_type = 'payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  v_gross,                    v_currency, v_gross,                    'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', v_platform_fee,             v_currency, v_platform_fee,             'ZAR'),
      (v_entry_id, v_payable_acct,  'credit', v_gross - v_platform_fee,   v_currency, v_gross - v_platform_fee,   'ZAR');

  ELSIF NEW.transaction_type = 'refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_refund_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'tip' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_tips_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'payout' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_payable_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'tax' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_tax_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'service_fee' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type IN ('cancellation_fee', 'travel_fee', 'provider_earnings') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  -- ── New branches (R6) ──────────────────────────────────────────────────
  ELSIF NEW.transaction_type = 'wallet_payment' THEN
    -- Customer wallet balance goes down, provider is owed the amount.
    -- DR wallet liability, CR provider payable.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_wallet_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'gift_card_payment' THEN
    -- Gift card balance goes down, provider is owed the amount.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_gift_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'loyalty_redemption' THEN
    -- Platform-borne loyalty: DR loyalty liability, CR provider payable.
    -- If product later decides loyalty is provider-borne, swap DR for a
    -- provider-revenue contra account in a follow-up migration.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_loyalty_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.shadow_post_finance_transaction() IS
  'R6 (audit 2026-04 final pass): shadow every finance_transactions row '
  'into journal_entries. Widened from 505 to include wallet_payment, '
  'gift_card_payment and loyalty_redemption so reconciliation no longer '
  'drifts on zero-gateway bookings.';

COMMIT;
