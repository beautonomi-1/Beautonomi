-- F14 — Double-entry general ledger (shadow).
--
-- Motivation: finance_transactions is a single-entry ledger which makes it
-- impossible to prove that the books balance. This migration introduces the
-- foundational tables for a proper double-entry ledger and BEGINS A SHADOW
-- WRITE PHASE — every legacy finance_transactions insert is ALSO recorded
-- as a balanced journal_entry via trigger. Reads are NOT yet migrated.
--
-- Roll-out plan (see docs/PLAYBOOKS):
--   Phase 1 (THIS MIGRATION): create schema + shadow-writer + reconciliation view.
--   Phase 2: backfill historical finance_transactions rows.
--   Phase 3: cut over admin reports to journal_entries/journal_lines.
--   Phase 4: retire finance_transactions as a write target (read-only legacy).

-- ─── Chart of accounts ────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.gl_account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.gl_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  type        public.gl_account_type NOT NULL,
  normal_side text NOT NULL CHECK (normal_side IN ('debit', 'credit')),
  parent_id   uuid REFERENCES public.gl_accounts(id),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.gl_accounts (code, name, type, normal_side) VALUES
  ('1000', 'Cash (gateway clearing)',  'asset',     'debit'),
  ('1100', 'Customer receivables',     'asset',     'debit'),
  ('2000', 'Provider payable',         'liability', 'credit'),
  ('2100', 'Tax payable',              'liability', 'credit'),
  ('2200', 'Tips payable',             'liability', 'credit'),
  ('3000', 'Platform revenue',         'revenue',   'credit'),
  ('4000', 'Gateway fees',             'expense',   'debit'),
  ('4100', 'Refunds issued',           'expense',   'debit')
ON CONFLICT (code) DO NOTHING;

-- ─── Journal entries + lines ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  provider_id     uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  booking_id      uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  payment_id      uuid REFERENCES public.booking_payments(id) ON DELETE SET NULL,
  refund_id       uuid REFERENCES public.booking_refunds(id) ON DELETE SET NULL,
  source          text NOT NULL,
  external_ref    text,
  description     text,
  posted_at       timestamptz NOT NULL DEFAULT now(),
  reporting_currency text NOT NULL DEFAULT 'ZAR',
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text NOT NULL DEFAULT 'shadow-trigger'
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_provider_posted
  ON public.journal_entries (provider_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_payment
  ON public.journal_entries (payment_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_refund
  ON public.journal_entries (refund_id);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id           uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id         uuid NOT NULL REFERENCES public.gl_accounts(id),
  side               text NOT NULL CHECK (side IN ('debit', 'credit')),
  raw_amount         numeric(18, 4) NOT NULL CHECK (raw_amount >= 0),
  raw_currency       text NOT NULL,
  fx_rate            numeric(18, 8) NOT NULL DEFAULT 1,
  reporting_amount   numeric(18, 4) NOT NULL CHECK (reporting_amount >= 0),
  reporting_currency text NOT NULL DEFAULT 'ZAR',
  memo               text
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
  ON public.journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account
  ON public.journal_lines (account_id);

-- ─── Per-entry balance enforcement ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_journal_entry_balance_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id uuid := COALESCE(NEW.entry_id, OLD.entry_id);
  v_debits   numeric;
  v_credits  numeric;
BEGIN
  SELECT COALESCE(SUM(reporting_amount) FILTER (WHERE side = 'debit'),  0),
         COALESCE(SUM(reporting_amount) FILTER (WHERE side = 'credit'), 0)
    INTO v_debits, v_credits
  FROM public.journal_lines
  WHERE entry_id = v_entry_id;

  IF v_debits <> v_credits THEN
    RAISE EXCEPTION 'journal_entry % is not balanced: debits=% credits=%',
      v_entry_id, v_debits, v_credits
      USING ERRCODE = '22000';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_balance ON public.journal_lines;
CREATE CONSTRAINT TRIGGER trg_journal_lines_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_entry_balance_row();

-- ─── Shadow-writer: finance_transactions -> journal_entries ───────────────────
--
-- For every `payment` row we book:
--   DR 1000 Cash clearing          (amount gross)
--   CR 2000 Provider payable       (amount gross - platform fee - tax - tip)
--   CR 2100 Tax payable            (tax portion, if any)
--   CR 2200 Tips payable           (tip portion, if any)
--   CR 3000 Platform revenue       (platform fee)
--   DR 4000 Gateway fees           (gateway_fee)
--   CR 1000 Cash clearing          (gateway_fee)   [two legs net to cash]
--
-- For MVP we do a simplified 2-line entry (gross cash DR / provider payable CR
-- minus platform fee CR) that always balances. Richer posting maps will be
-- added in app-level posting-map.ts when we cut reads over.

CREATE OR REPLACE FUNCTION public.shadow_post_finance_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id     uuid;
  v_cash_acct    uuid;
  v_payable_acct uuid;
  v_platform_acct uuid;
  v_refund_acct  uuid;
  v_gross        numeric := COALESCE(NEW.amount, 0);
  v_platform_fee numeric := COALESCE(NEW.net, 0);
  -- finance_transactions does not (currently) carry a currency column.
  -- All posting rows are reported in ZAR until a multi-currency migration adds one.
  v_currency     text    := 'ZAR';
BEGIN
  IF NEW.transaction_type NOT IN ('payment', 'refund', 'tip', 'payout') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cash_acct    FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_payable_acct FROM public.gl_accounts WHERE code = '2000';
  SELECT id INTO v_platform_acct FROM public.gl_accounts WHERE code = '3000';
  SELECT id INTO v_refund_acct  FROM public.gl_accounts WHERE code = '4100';

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
      (v_entry_id, v_cash_acct,    'debit',  v_gross,                v_currency, v_gross,                'ZAR'),
      (v_entry_id, v_platform_acct,'credit', v_platform_fee,         v_currency, v_platform_fee,         'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', v_gross - v_platform_fee, v_currency, v_gross - v_platform_fee, 'ZAR');
  ELSIF NEW.transaction_type = 'refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_refund_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  ELSE
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_transactions_shadow_journal ON public.finance_transactions;
CREATE TRIGGER trg_finance_transactions_shadow_journal
  AFTER INSERT ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.shadow_post_finance_transaction();

-- ─── Reconciliation view ──────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_ledger_reconciliation AS
SELECT
  ft.id                       AS finance_tx_id,
  ft.provider_id,
  ft.transaction_type,
  ft.amount                   AS legacy_amount,
  je.id                       AS journal_entry_id,
  (SELECT COALESCE(SUM(reporting_amount) FILTER (WHERE side = 'debit'),  0)
     FROM public.journal_lines WHERE entry_id = je.id) AS debit_total,
  (SELECT COALESCE(SUM(reporting_amount) FILTER (WHERE side = 'credit'), 0)
     FROM public.journal_lines WHERE entry_id = je.id) AS credit_total
FROM public.finance_transactions ft
LEFT JOIN public.journal_entries je
  ON je.source = 'finance_transactions' AND je.external_ref = ft.id::text;

COMMENT ON VIEW public.v_ledger_reconciliation IS
  'F14: compares legacy finance_transactions rows to shadow-written journal entries. Any row with journal_entry_id IS NULL indicates the shadow writer missed it.';

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.gl_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gl_accounts_read ON public.gl_accounts;
CREATE POLICY gl_accounts_read ON public.gl_accounts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS journal_entries_read ON public.journal_entries;
CREATE POLICY journal_entries_read ON public.journal_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'admin_finance', 'admin_operations')
    )
    OR EXISTS (
      SELECT 1 FROM public.provider_staff ps
      WHERE ps.provider_id = journal_entries.provider_id AND ps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS journal_lines_read ON public.journal_lines;
CREATE POLICY journal_lines_read ON public.journal_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_lines.entry_id
        AND (
          EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'admin_finance', 'admin_operations')
          )
          OR EXISTS (
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.provider_id = je.provider_id AND ps.user_id = auth.uid()
          )
        )
    )
  );

COMMENT ON TABLE public.journal_entries IS
  'F14: double-entry ledger entries. Phase 1 = shadow-written by trigger; future phases migrate reads here and retire finance_transactions writes.';
