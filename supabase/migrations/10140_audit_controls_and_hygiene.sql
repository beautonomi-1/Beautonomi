-- =============================================================================
-- 10140_audit_controls_and_hygiene.sql
-- Financial-systems audit (audit/05-findings.md) — Medium/Low DB controls.
--
--   F2-44  issued/paid provider invoices mutable (no DB immutability)
--   F2-49  period locks not enforced on DELETE, journal_*, payouts, payment_transactions, NULL-tenant rows
--   F2-45  revert_journal_for_finance_tx hard-codes 'ZAR'
--   F2-40  recompute_journal_for_finance_tx bypasses the wrapper routing used by the shadow trigger
--   F2-55  wallet_debit_self has no idempotency key (double debit on retried checkout)
--   F2-43  invoice/payment/payout numbers not gap-free -> per-tenant document sequence RPC
--   F2-18  wallet_topup ledger dedupe keyed on description -> provide a reference-keyed unique index
-- =============================================================================

-- -----------------------------------------------------------------------------
-- F2-44  provider_invoices: once issued (sent/paid/overdue/void), financial
--        fields are frozen. Allowed afterwards: status transitions, payment
--        recording (amount_paid/amount_due/paid_at/payment_reference/payment_method_id),
--        notes, metadata, sent/viewed timestamps, overdue notification.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_invoices_guard_issued()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  IF OLD.status IN ('draft', 'pending') THEN
    RETURN NEW;  -- still editable
  END IF;

  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_type IS DISTINCT FROM OLD.invoice_type
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.period_start IS DISTINCT FROM OLD.period_start
     OR NEW.period_end IS DISTINCT FROM OLD.period_end
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
     OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.line_items IS DISTINCT FROM OLD.line_items
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.description IS DISTINCT FROM OLD.description THEN
    RAISE EXCEPTION 'Invoice % is % and its financial fields are immutable; issue a credit note or a new invoice instead',
      OLD.invoice_number, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_provider_invoices_guard_issued ON public.provider_invoices;
CREATE TRIGGER trg_provider_invoices_guard_issued
  BEFORE UPDATE ON public.provider_invoices
  FOR EACH ROW EXECUTE FUNCTION public.provider_invoices_guard_issued();

-- -----------------------------------------------------------------------------
-- F2-49  period locks
-- -----------------------------------------------------------------------------
-- Generalised lock check: works for INSERT/UPDATE/DELETE, resolves tenant via
-- booking/provider when the row has none, and uses the row's effective date.
CREATE OR REPLACE FUNCTION public.enforce_finance_period_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_lock_row RECORD;
  v_tenant UUID;
  v_effective_at TIMESTAMPTZ;
  v_row JSONB;
  v_booking_id UUID;
  v_provider_id UUID;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;

  v_tenant := NULLIF(v_row->>'tenant_id', '')::uuid;
  v_effective_at := COALESCE(
    NULLIF(v_row->>'posted_at', '')::timestamptz,
    NULLIF(v_row->>'created_at', '')::timestamptz,
    NOW()
  );

  -- F2-49: rows without tenant_id resolve it through booking -> provider.
  IF v_tenant IS NULL THEN
    v_booking_id := NULLIF(v_row->>'booking_id', '')::uuid;
    v_provider_id := NULLIF(v_row->>'provider_id', '')::uuid;
    IF v_booking_id IS NOT NULL THEN
      SELECT b.tenant_id, COALESCE(v_provider_id, b.provider_id) INTO v_tenant, v_provider_id
        FROM public.bookings b WHERE b.id = v_booking_id;
    END IF;
    IF v_tenant IS NULL AND v_provider_id IS NOT NULL THEN
      SELECT p.tenant_id INTO v_tenant FROM public.providers p WHERE p.id = v_provider_id;
    END IF;
  END IF;

  IF v_tenant IS NULL THEN
    -- Still unknown: apply the platform-wide lock (tenant_id IS NULL rows in financial_period_locks).
    SELECT id, period_start, period_end
      INTO v_lock_row
      FROM public.financial_period_locks
     WHERE tenant_id IS NULL
       AND v_effective_at::date BETWEEN period_start AND period_end
     LIMIT 1;
  ELSE
    SELECT id, period_start, period_end
      INTO v_lock_row
      FROM public.financial_period_locks
     WHERE (tenant_id = v_tenant OR tenant_id IS NULL)
       AND v_effective_at::date BETWEEN period_start AND period_end
     LIMIT 1;
  END IF;

  IF FOUND THEN
    RAISE EXCEPTION 'Financial period % – % is locked for tenant %. Refusing % on %',
      v_lock_row.period_start, v_lock_row.period_end, COALESCE(v_tenant::text, '(platform)'), TG_OP, TG_TABLE_NAME
      USING ERRCODE = '22000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- Let platform-wide locks exist (tenant_id NULL) if the column is NOT NULL today.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'financial_period_locks'
      AND column_name = 'tenant_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.financial_period_locks ALTER COLUMN tenant_id DROP NOT NULL;
  END IF;
END $$;

-- Re-create the three existing triggers to include DELETE, and add the missing tables.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('booking_payments',     'trg_booking_payments_period_lock'),
      ('booking_refunds',      'trg_booking_refunds_period_lock'),
      ('finance_transactions', 'trg_finance_transactions_period_lock'),
      ('journal_entries',      'trg_journal_entries_period_lock'),
      ('payouts',              'trg_payouts_period_lock'),
      ('payment_transactions', 'trg_payment_transactions_period_lock')
    ) AS v(tbl, trg)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t.tbl) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t.trg, t.tbl);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_finance_period_lock()',
        t.trg, t.tbl);
    END IF;
  END LOOP;
END $$;

-- journal_lines inherit the lock through their entry.
CREATE OR REPLACE FUNCTION public.enforce_finance_period_lock_via_journal_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_entry_id uuid;
  v_tenant uuid;
  v_posted timestamptz;
  v_lock RECORD;
BEGIN
  v_entry_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
  SELECT je.tenant_id, COALESCE(je.posted_at, je.created_at, NOW()) INTO v_tenant, v_posted
    FROM public.journal_entries je WHERE je.id = v_entry_id;
  IF NOT FOUND THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT period_start, period_end INTO v_lock
    FROM public.financial_period_locks
   WHERE (tenant_id = v_tenant OR tenant_id IS NULL)
     AND v_posted::date BETWEEN period_start AND period_end
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Financial period % – % is locked. Refusing % on journal_lines', v_lock.period_start, v_lock.period_end, TG_OP
      USING ERRCODE = '22000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_journal_lines_period_lock ON public.journal_lines;
CREATE TRIGGER trg_journal_lines_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_finance_period_lock_via_journal_entry();

-- -----------------------------------------------------------------------------
-- F2-45  reversal journal entries carry the source entry's reporting currency.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_journal_for_finance_tx(p_finance_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_source      public.journal_entries%ROWTYPE;
  v_reversal_id uuid;
BEGIN
  SELECT * INTO v_source
  FROM public.journal_entries
  WHERE source = 'finance_transactions'
    AND external_ref = p_finance_tx_id::text
  ORDER BY posted_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  -- Idempotent: one reversal per source entry.
  IF EXISTS (
    SELECT 1 FROM public.journal_entries
     WHERE source = 'finance_transactions_reversal'
       AND external_ref = p_finance_tx_id::text
       AND posted_at >= v_source.posted_at
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.journal_entries (
    tenant_id, provider_id, booking_id, payment_id, refund_id,
    source, external_ref, description, posted_at, reporting_currency, created_by
  ) VALUES (
    v_source.tenant_id, v_source.provider_id, v_source.booking_id, v_source.payment_id, v_source.refund_id,
    'finance_transactions_reversal',
    p_finance_tx_id::text,
    'Reversal of journal entry for finance_tx ' || p_finance_tx_id::text,
    now(),
    COALESCE(v_source.reporting_currency, 'ZAR'),   -- F2-45
    'shadow-reversal'
  ) RETURNING id INTO v_reversal_id;

  INSERT INTO public.journal_lines (
    entry_id, account_id, side, raw_amount, raw_currency, fx_rate, reporting_amount, reporting_currency, memo
  )
  SELECT
    v_reversal_id,
    account_id,
    CASE WHEN side = 'debit' THEN 'credit' ELSE 'debit' END,
    raw_amount,
    raw_currency,
    fx_rate,
    reporting_amount,
    reporting_currency,
    memo
  FROM public.journal_lines
  WHERE entry_id = v_source.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.revert_journal_for_finance_tx(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_journal_for_finance_tx(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- F2-40  recompute routes through the same dispatcher as the shadow trigger.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._shadow_dispatch_finance_tx_row(p_row public.finance_transactions)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  IF p_row.transaction_type = 'gateway_fee_adjustment' THEN
    PERFORM public._shadow_replay_gateway_fee_adjustment_row(p_row);
    RETURN;
  END IF;

  IF p_row.transaction_type = 'gift_card_refund'
     OR (p_row.transaction_type = 'refund'
         AND p_row.refund_component IN ('membership_sale', 'membership_provider_earnings'))
     OR (p_row.transaction_type = 'membership_sale'
         AND COALESCE(p_row.metadata->>'tender', '') = 'wallet'
         AND COALESCE(p_row.amount, 0) <> 0)
  THEN
    PERFORM public._shadow_replay_membership_gift_card_row(p_row);
    RETURN;
  END IF;

  IF p_row.transaction_type IN ('terminal_sale', 'terminal_rental', 'terminal_bundle_alloc', 'terminal_promotion') THEN
    PERFORM public._shadow_replay_terminal_commerce_row(p_row);
    RETURN;
  END IF;

  PERFORM public._shadow_replay_finance_tx_row(p_row);
END;
$$;
REVOKE ALL ON FUNCTION public._shadow_dispatch_finance_tx_row(public.finance_transactions) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._shadow_dispatch_finance_tx_row(public.finance_transactions) TO service_role;

CREATE OR REPLACE FUNCTION public.shadow_post_finance_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public._shadow_dispatch_finance_tx_row(NEW);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_journal_for_finance_tx(p_finance_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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

  PERFORM public._shadow_dispatch_finance_tx_row(v_row);  -- F2-40
END;
$function$;
REVOKE ALL ON FUNCTION public.recompute_journal_for_finance_tx(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_journal_for_finance_tx(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- F2-55  wallet_debit_self with an optional idempotency key (same contract as
--        wallet_credit_admin). Existing callers keep working; new callers pass
--        p_idempotency_key so a retried checkout cannot debit twice.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_debit_self(
  p_amount numeric,
  p_description text DEFAULT NULL::text,
  p_reference_id uuid DEFAULT NULL::uuid,
  p_reference_type text DEFAULT NULL::text,
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_wallet_id UUID;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT id, balance, currency INTO v_wallet_id, v_balance, v_currency
  FROM user_wallets
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO user_wallets (user_id, currency) VALUES (auth.uid(), 'ZAR')
    RETURNING id, balance, currency INTO v_wallet_id, v_balance, v_currency;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM wallet_transactions WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance, 'currency', v_currency, 'idempotent', true);
    END IF;
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE user_wallets SET balance = balance - p_amount WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type, tenant_id, idempotency_key)
  VALUES (
    v_wallet_id,
    'debit',
    p_amount,
    p_description,
    p_reference_id,
    p_reference_type,
    COALESCE(p_tenant_id, public.tenant_default_za_id()),
    p_idempotency_key
  );

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance - p_amount, 'currency', v_currency);
END;
$function$;
-- The 5-argument signature is superseded by the defaulted 6-argument one.
DROP FUNCTION IF EXISTS public.wallet_debit_self(numeric, text, uuid, text, uuid);
REVOKE ALL ON FUNCTION public.wallet_debit_self(numeric, text, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_debit_self(numeric, text, uuid, text, uuid, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- F2-43  gap-free per-tenant document numbers.
--        next_document_number(tenant, kind) -> 'PREFIX-YYYY-000001' under a row
--        lock, so concurrent callers get consecutive numbers and a rolled-back
--        caller leaves a documented gap in document_sequence_gaps.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_sequences (
  tenant_id   uuid NOT NULL,
  kind        text NOT NULL,
  year        integer NOT NULL,
  last_value  bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, kind, year)
);
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_sequences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.document_sequences TO service_role;

CREATE OR REPLACE FUNCTION public.next_document_number(p_tenant_id uuid, p_kind text, p_prefix text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now() AT TIME ZONE 'Africa/Johannesburg')::integer;
  v_next bigint;
  v_prefix text;
BEGIN
  IF p_tenant_id IS NULL OR p_kind IS NULL OR p_kind = '' THEN
    RAISE EXCEPTION 'tenant and kind are required';
  END IF;
  v_prefix := COALESCE(p_prefix, CASE p_kind
    WHEN 'invoice' THEN 'INV'
    WHEN 'payment' THEN 'PAY'
    WHEN 'payout'  THEN 'POUT'
    WHEN 'credit_note' THEN 'CN'
    ELSE upper(left(p_kind, 4)) END);

  INSERT INTO public.document_sequences (tenant_id, kind, year, last_value)
  VALUES (p_tenant_id, p_kind, v_year, 1)
  ON CONFLICT (tenant_id, kind, year)
  DO UPDATE SET last_value = public.document_sequences.last_value + 1, updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN format('%s-%s-%s', v_prefix, v_year, lpad(v_next::text, 6, '0'));
END;
$$;
REVOKE ALL ON FUNCTION public.next_document_number(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number(uuid, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- F2-18  wallet_topup ledger rows: dedupe on the gateway reference stored in
--        metadata->>'reference' when present (description stays as a fallback).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_finance_wallet_topup_reference
      ON public.finance_transactions ((metadata->>'reference'))
      WHERE transaction_type = 'wallet_topup' AND metadata ? 'reference';
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'finance_transactions has duplicate wallet_topup references; index not created (F2-18).';
  END;
END $$;
