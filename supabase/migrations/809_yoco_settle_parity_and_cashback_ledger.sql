-- 809: Yoco settle parity columns + card-machine cashback as distinct FT type
--
-- 1) provider_yoco_payments gains tip/entity columns (PayCloud-parity settle metadata)
-- 2) booking_payments with payment_provider_data.cashback=true post finance_transactions.cashback
-- 3) Void/refund of cashback-only payments reverse only the cashback component (no PE clawback)
-- 4) GL shadow allowlists + posts cashback as cash-drawer wash (not tips payable)

ALTER TABLE public.provider_yoco_payments
  ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (tip_amount >= 0),
  ADD COLUMN IF NOT EXISTS entity_type TEXT
    CHECK (
      entity_type IS NULL
      OR entity_type IN (
        'booking',
        'group_booking',
        'sale',
        'product_order',
        'additional_charge'
      )
    ),
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS group_booking_id UUID;

COMMENT ON COLUMN public.provider_yoco_payments.tip_amount IS
  'Tip authorized with the capture (major units). Settled as a separate booking_payments tip row.';
COMMENT ON COLUMN public.provider_yoco_payments.entity_type IS
  'Settle target entity for settleYocoPayment (booking/group/sale/product_order/additional_charge).';

CREATE INDEX IF NOT EXISTS idx_yoco_payments_entity
  ON public.provider_yoco_payments (provider_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

INSERT INTO public.gl_accounts (code, name, type, normal_side)
VALUES ('2210', 'Card machine cashback', 'liability', 'credit')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_cashback_ledger_from_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking RECORD;
  v_tenant_id UUID;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.payment_provider_data ->> 'cashback', '') <> 'true' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.finance_transactions ft WHERE ft.source_payment_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT b.id, b.booking_number, b.provider_id, b.tenant_id
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;

  IF NOT FOUND THEN
    RAISE WARNING 'create_cashback_ledger_from_payment: booking % not found', NEW.booking_id;
    RETURN NEW;
  END IF;

  v_tenant_id := COALESCE(
    v_booking.tenant_id,
    (SELECT p.tenant_id FROM public.providers p WHERE p.id = v_booking.provider_id),
    public.tenant_default_za_id()
  );

  INSERT INTO public.finance_transactions (
    tenant_id, booking_id, provider_id, source_payment_id,
    transaction_type, amount, fees, commission, net, description, created_at
  ) VALUES (
    v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
    'cashback', NEW.amount, 0, 0, NEW.amount,
    'Card machine cashback for booking ' || v_booking.booking_number,
    NOW()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aaa_create_cashback_ledger_on_payment_insert ON public.booking_payments;
CREATE TRIGGER aaa_create_cashback_ledger_on_payment_insert
  AFTER INSERT ON public.booking_payments
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION public.create_cashback_ledger_from_payment();

DROP TRIGGER IF EXISTS aaa_create_cashback_ledger_on_payment_update ON public.booking_payments;
CREATE TRIGGER aaa_create_cashback_ledger_on_payment_update
  AFTER UPDATE OF status ON public.booking_payments
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.create_cashback_ledger_from_payment();

CREATE OR REPLACE FUNCTION public.create_cashback_ledger_from_booking_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment RECORD;
  v_booking RECORD;
  v_tenant_id UUID;
  v_cashback_net NUMERIC(12, 2);
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.finance_transactions ft
    WHERE ft.source_refund_id = NEW.id
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT bp.id, bp.booking_id, bp.amount, bp.payment_provider_data, bp.payment_provider_id
  INTO v_payment
  FROM public.booking_payments bp
  WHERE bp.id = NEW.payment_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_payment.payment_provider_data ->> 'cashback', '') <> 'true'
     AND NOT COALESCE(v_payment.payment_provider_id, '') LIKE '%:cashback' THEN
    RETURN NEW;
  END IF;

  SELECT id, provider_id, tenant_id, booking_number
    INTO v_booking
    FROM public.bookings
   WHERE id = NEW.booking_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_tenant_id := COALESCE(
    v_booking.tenant_id,
    (SELECT p.tenant_id FROM public.providers p WHERE p.id = v_booking.provider_id),
    public.tenant_default_za_id()
  );

  SELECT COALESCE(SUM(net), 0) INTO v_cashback_net
  FROM public.finance_transactions
  WHERE source_payment_id = v_payment.id
    AND transaction_type = 'cashback'
    AND source_refund_id IS NULL;

  IF v_cashback_net = 0 THEN
    v_cashback_net := COALESCE(NEW.amount, v_payment.amount, 0);
  END IF;

  INSERT INTO public.finance_transactions (
    tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
    refund_component, transaction_type, amount, fees, commission, net, description, created_at
  ) VALUES (
    v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.payment_id, NEW.id,
    'cashback', 'refund', ABS(v_cashback_net), 0, 0, -ABS(v_cashback_net),
    format('Cashback void/refund for booking %s', COALESCE(v_booking.booking_number, v_booking.id::text)),
    COALESCE(NEW.updated_at, NEW.created_at, NOW())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aaa_create_cashback_ledger_on_booking_refund ON public.booking_refunds;
CREATE TRIGGER aaa_create_cashback_ledger_on_booking_refund
  AFTER INSERT OR UPDATE OF status ON public.booking_refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.create_cashback_ledger_from_booking_refund();

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
  v_gross            numeric := COALESCE(p_row.amount, 0);
  v_fees             numeric := COALESCE(p_row.fees,   0);
  v_platform_fee     numeric := COALESCE(p_row.net,    0);
  v_currency         text    := COALESCE(p_row.currency, 'ZAR');
BEGIN
  IF p_row.transaction_type IS NULL THEN RETURN; END IF;

  IF p_row.transaction_type = 'gift_card_liability_reduction' THEN RETURN; END IF;

  IF p_row.transaction_type = 'provider_earnings' THEN RETURN; END IF;

  IF p_row.transaction_type = 'membership_sale' AND COALESCE(v_gross, 0) = 0 THEN RETURN; END IF;

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
    RAISE WARNING 'shadow_post_finance_transaction: unhandled transaction_type %', p_row.transaction_type;
    RETURN;
  END IF;

  SELECT id INTO v_cash_acct       FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_cash_hand_acct  FROM public.gl_accounts WHERE code = '1100';
  SELECT id INTO v_payable_acct    FROM public.gl_accounts WHERE code = '2000';
  SELECT id INTO v_tax_acct        FROM public.gl_accounts WHERE code = '2100';
  SELECT id INTO v_tips_acct       FROM public.gl_accounts WHERE code = '2200';
  SELECT id INTO v_cashback_acct FROM public.gl_accounts WHERE code = '2210';
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
        (v_entry_id, v_wallet_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF p_row.refund_component = 'gift_card_payment' THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_gift_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF p_row.refund_component = 'cashback' THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, COALESCE(v_cash_hand_acct, v_cash_acct), 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, COALESCE(v_cashback_acct, v_cash_hand_acct), 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSIF p_row.refund_component IN ('promotion_discount', 'membership_discount', 'loyalty_redemption') THEN
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_promo_contra,  'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_promo_expense, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
    ELSE
      INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
        (v_entry_id, v_refund_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
        (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);
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
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_tax_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

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

  ELSIF p_row.transaction_type = 'loyalty_redemption' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_loyalty_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'promotion_discount' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_promo_expense, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_promo_contra,  'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

  ELSIF p_row.transaction_type = 'membership_discount' THEN
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
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_def_subs_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), v_currency),
      (v_entry_id, v_cash_acct,     'credit', abs(v_gross), v_currency, abs(v_gross), v_currency);

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

