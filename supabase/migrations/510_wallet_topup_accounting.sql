BEGIN;

-- Add wallet_topup to the allowlist
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
    'loyalty_redemption',
    'wallet_topup'
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

  ELSIF NEW.transaction_type = 'wallet_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_wallet_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'gift_card_payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_gift_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'loyalty_redemption' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_loyalty_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'wallet_topup' THEN
    -- Wallet topup: DR Cash (1000), CR Wallet Liability (2300)
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,   'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_wallet_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;