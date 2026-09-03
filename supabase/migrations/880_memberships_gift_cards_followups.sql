-- 880: Memberships (J1) and gift cards (J2) follow-ups.
--
--   Gift cards:
--     * gift_cards.voided_at + expiry reminder stamps (30d / 7d, idempotent cron).
--     * gift_card_orders scheduled delivery (deliver_at, delivery_channel,
--       recipient_phone, delivered_at) + refunded_at, status 'refunded' /
--       'partially_refunded'.
--     * 'gift_card_refund' finance type: DR 2400 Gift card liability / CR 1000 Cash
--       (order-level Paystack/admin refund of unredeemed balance).
--   Memberships:
--     * user_memberships.scheduled_plan_id / scheduled_change_at (plan change at
--       period end, no proration) + refunded_at.
--     * membership_orders.refunded_at, status 'refunded'.
--     * Refund shadow GL: 'refund' rows with refund_component 'membership_sale'
--       reverse 2600 (DR 2600 / CR 1000); 'membership_provider_earnings' reverse
--       the payable leg (DR 2000 / CR 2600) instead of both hitting 2000/1000.
--     * Wallet-tendered membership_sale posts DR 2300 Wallet liability / CR 2600
--       (metadata.tender = 'wallet') instead of DR cash.
--   Notification templates: gift_card_expiring_30d, gift_card_expiring_7d,
--     gift_card_delivered, membership_receipt.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ─── Gift cards ───────────────────────────────────────────────────────────────

ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_30_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_7_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.gift_cards.voided_at IS
  'Set when an order-level refund voided this card (is_active = false, balance reversed to cash).';
COMMENT ON COLUMN public.gift_cards.reminder_30_sent_at IS
  'gift-card-expiry-reminders cron: 30-day expiry reminder sent (idempotency stamp).';
COMMENT ON COLUMN public.gift_cards.reminder_7_sent_at IS
  'gift-card-expiry-reminders cron: 7-day expiry reminder sent (idempotency stamp).';

CREATE INDEX IF NOT EXISTS idx_gift_cards_expiry_reminder_scan
  ON public.gift_cards (expires_at)
  WHERE is_active = true AND balance > 0 AND expires_at IS NOT NULL;

ALTER TABLE public.gift_card_orders
  ADD COLUMN IF NOT EXISTS deliver_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_channel TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.gift_card_orders.deliver_at IS
  'When set and in the future at purchase, recipient delivery is deferred to this timestamp (cron gift-card-expiry-reminders).';
COMMENT ON COLUMN public.gift_card_orders.delivery_channel IS
  'email | sms | email_sms — recipient delivery channels.';
COMMENT ON COLUMN public.gift_card_orders.delivered_at IS
  'Set once the deferred/SMS delivery for this order has been sent.';

DO $$
BEGIN
  ALTER TABLE public.gift_card_orders
    DROP CONSTRAINT IF EXISTS gift_card_orders_delivery_channel_check;
  ALTER TABLE public.gift_card_orders
    ADD CONSTRAINT gift_card_orders_delivery_channel_check
    CHECK (delivery_channel IN ('email', 'sms', 'email_sms'));
END $$;

DO $$
BEGIN
  ALTER TABLE public.gift_card_orders
    DROP CONSTRAINT IF EXISTS gift_card_orders_status_check;
  ALTER TABLE public.gift_card_orders
    ADD CONSTRAINT gift_card_orders_status_check
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded'));
END $$;

CREATE INDEX IF NOT EXISTS idx_gift_card_orders_pending_delivery
  ON public.gift_card_orders (deliver_at)
  WHERE status = 'paid' AND delivered_at IS NULL;

-- ─── Memberships ──────────────────────────────────────────────────────────────

ALTER TABLE public.user_memberships
  ADD COLUMN IF NOT EXISTS scheduled_plan_id UUID REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_change_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_memberships.scheduled_plan_id IS
  'Plan to switch to at period end (no proration). Applied by applyScheduledMembershipPlanChange before the renewal charge.';
COMMENT ON COLUMN public.user_memberships.scheduled_change_at IS
  'When the scheduled plan change takes effect (normally expires_at / next_billing_at).';

ALTER TABLE public.membership_orders
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.membership_orders
    DROP CONSTRAINT IF EXISTS membership_orders_status_check;
  ALTER TABLE public.membership_orders
    ADD CONSTRAINT membership_orders_status_check
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded'));
END $$;

-- ─── Notification templates ───────────────────────────────────────────────────

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'gift_card_expiring_30d',
  'Your gift card expires in 30 days',
  'Your {{currency}} {{balance}} Beautonomi gift card (…{{code_last4}}) expires on {{expires_at}}. Book a treatment and use it before then.',
  'Your Beautonomi gift card expires in 30 days',
  '<p>Your gift card ending in <strong>{{code_last4}}</strong> still has <strong>{{currency}} {{balance}}</strong> left and expires on <strong>{{expires_at}}</strong>.</p><p><a href="{{app_url}}/account-settings/wallet">Use it now</a></p>',
  'Your Beautonomi gift card (…{{code_last4}}) with {{currency}} {{balance}} expires on {{expires_at}}. Use it before then.',
  ARRAY['push', 'email'],
  ARRAY['code_last4', 'balance', 'currency', 'expires_at', 'days_until', 'app_url'],
  TRUE,
  'Gift card balance expiring in 30 days (cron gift-card-expiry-reminders).'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'gift_card_expiring_30d');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'gift_card_expiring_7d',
  'Your gift card expires in 7 days',
  'Last chance: your {{currency}} {{balance}} Beautonomi gift card (…{{code_last4}}) expires on {{expires_at}}.',
  'Your Beautonomi gift card expires in 7 days',
  '<p>Last chance! Your gift card ending in <strong>{{code_last4}}</strong> has <strong>{{currency}} {{balance}}</strong> left and expires on <strong>{{expires_at}}</strong>.</p><p><a href="{{app_url}}/account-settings/wallet">Use it now</a></p>',
  'Last chance: your Beautonomi gift card (…{{code_last4}}) with {{currency}} {{balance}} expires on {{expires_at}}.',
  ARRAY['push', 'email'],
  ARRAY['code_last4', 'balance', 'currency', 'expires_at', 'days_until', 'app_url'],
  TRUE,
  'Gift card balance expiring in 7 days (cron gift-card-expiry-reminders).'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'gift_card_expiring_7d');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'gift_card_delivered',
  'Your gift was delivered',
  'Your {{currency}} {{amount}} gift card for {{recipient_name}} was delivered{{#channel}} via {{channel}}{{/channel}}.',
  'Your Beautonomi gift card was delivered',
  '<p>Your <strong>{{currency}} {{amount}}</strong> gift card for <strong>{{recipient_name}}</strong> has been delivered.</p>',
  'Your Beautonomi gift card for {{recipient_name}} was delivered.',
  ARRAY['push'],
  ARRAY['recipient_name', 'amount', 'currency', 'channel', 'app_url'],
  TRUE,
  'Purchaser confirmation when a scheduled/SMS gift card delivery is sent.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'gift_card_delivered');

INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'membership_receipt',
  'Membership receipt',
  'Thanks! We received {{currency}} {{amount}} for your {{membership_name}} membership at {{provider_name}}. Benefits run until {{expires_at}}.',
  'Your {{provider_name}} membership receipt',
  '<p>Thanks for your payment of <strong>{{currency}} {{amount}}</strong> for your <strong>{{membership_name}}</strong> membership at <strong>{{provider_name}}</strong>.</p><p>Paid with {{payment_method}} · Reference {{reference}}</p><p>Your benefits run until <strong>{{expires_at}}</strong>.</p><p><a href="{{app_url}}/account-settings/membership">Manage membership</a></p>',
  'Beautonomi: {{currency}} {{amount}} received for your {{membership_name}} membership at {{provider_name}}.',
  ARRAY['push', 'email'],
  ARRAY['membership_name', 'provider_name', 'amount', 'currency', 'expires_at', 'payment_method', 'reference', 'app_url'],
  TRUE,
  'Customer receipt after a salon membership purchase or renewal.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'membership_receipt');

-- ─── Shadow GL: gift card refund + membership refund components + wallet tender ─

CREATE OR REPLACE FUNCTION public._shadow_replay_membership_gift_card_row(p_row public.finance_transactions)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id         uuid;
  v_cash_acct        uuid;
  v_payable_acct     uuid;
  v_wallet_acct      uuid;
  v_gift_acct        uuid;
  v_membership_acct  uuid;
  v_gateway_acct     uuid;
  v_gross            numeric := abs(COALESCE(p_row.amount, 0));
  v_net              numeric := abs(COALESCE(p_row.net, p_row.amount, 0));
  v_fees             numeric := abs(COALESCE(p_row.fees, 0));
  v_currency         text    := COALESCE(p_row.currency, 'ZAR');
BEGIN
  IF v_gross = 0 AND v_net = 0 THEN RETURN; END IF;

  SELECT id INTO v_cash_acct       FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_payable_acct    FROM public.gl_accounts WHERE code = '2000';
  SELECT id INTO v_wallet_acct     FROM public.gl_accounts WHERE code = '2300';
  SELECT id INTO v_gift_acct       FROM public.gl_accounts WHERE code = '2400';
  SELECT id INTO v_membership_acct FROM public.gl_accounts WHERE code = '2600';
  SELECT id INTO v_gateway_acct    FROM public.gl_accounts WHERE code = '4000';

  INSERT INTO public.journal_entries (
    tenant_id, provider_id, booking_id, payment_id, refund_id,
    source, external_ref, description,
    posted_at, reporting_currency, created_by
  ) VALUES (
    p_row.tenant_id, p_row.provider_id, p_row.booking_id, p_row.source_payment_id, p_row.source_refund_id,
    'finance_transactions', p_row.id::text,
    p_row.transaction_type || COALESCE(':' || p_row.refund_component, ''),
    COALESCE(p_row.created_at, now()), v_currency, 'shadow-replay'
  ) RETURNING id INTO v_entry_id;

  IF p_row.transaction_type = 'gift_card_refund' THEN
    -- Order-level refund of unredeemed gift card value: liability out, cash out.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_gift_acct, 'debit',  v_gross, v_currency, v_gross, v_currency),
      (v_entry_id, v_cash_acct, 'credit', v_gross, v_currency, v_gross, v_currency);

  ELSIF p_row.transaction_type = 'refund' AND p_row.refund_component = 'membership_sale' THEN
    -- Reverse membership_sale (which posted DR cash / CR 2600 gross).
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_membership_acct, 'debit',  v_gross, v_currency, v_gross, v_currency),
      (v_entry_id, v_cash_acct,       'credit', v_gross, v_currency, v_gross, v_currency);

  ELSIF p_row.transaction_type = 'refund' AND p_row.refund_component = 'membership_provider_earnings' THEN
    -- Reverse membership_provider_earnings (which posted DR 2600 / CR 2000 net).
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_payable_acct,    'debit',  v_net, v_currency, v_net, v_currency),
      (v_entry_id, v_membership_acct, 'credit', v_net, v_currency, v_net, v_currency);

  ELSIF p_row.transaction_type = 'membership_sale' THEN
    -- Wallet-tendered membership sale: value moves from wallet liability to membership liability.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency) VALUES
      (v_entry_id, v_wallet_acct,     'debit',  v_gross, v_currency, v_gross, v_currency),
      (v_entry_id, v_membership_acct, 'credit', v_gross, v_currency, v_gross, v_currency);

  ELSE
    DELETE FROM public.journal_entries WHERE id = v_entry_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._shadow_replay_membership_gift_card_row(public.finance_transactions)
  TO service_role;

-- Route the new/patched cases before delegating to the existing replay functions
-- (762 terminal commerce, 863 general allowlist). Everything else is unchanged.
CREATE OR REPLACE FUNCTION public.shadow_post_finance_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.transaction_type = 'gift_card_refund'
     OR (NEW.transaction_type = 'refund'
         AND NEW.refund_component IN ('membership_sale', 'membership_provider_earnings'))
     OR (NEW.transaction_type = 'membership_sale'
         AND COALESCE(NEW.metadata->>'tender', '') = 'wallet'
         AND COALESCE(NEW.amount, 0) <> 0)
  THEN
    PERFORM public._shadow_replay_membership_gift_card_row(NEW);
    RETURN NEW;
  END IF;

  IF NEW.transaction_type IN (
    'terminal_sale', 'terminal_rental', 'terminal_bundle_alloc', 'terminal_promotion'
  ) THEN
    PERFORM public._shadow_replay_terminal_commerce_row(NEW);
    RETURN NEW;
  END IF;

  PERFORM public._shadow_replay_finance_tx_row(NEW);
  RETURN NEW;
END;
$$;

COMMIT;
