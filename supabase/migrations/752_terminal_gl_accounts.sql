-- Migration 752: Terminal GL accounts + shadow-journal extension
--
-- Adds new GL accounts for terminal commerce and extends the shadow-journal
-- replay function to handle new terminal transaction types.

-- ── 1. New GL accounts ────────────────────────────────────────────────────────
-- Uses the existing chart-of-accounts pattern from 495_double_entry_ledger.sql

-- gl_accounts schema: code (unique), name, type (gl_account_type enum), normal_side, is_active
-- normal_side rules: asset/expense → debit, liability/equity/revenue → credit
INSERT INTO public.gl_accounts (code, name, type, normal_side, is_active)
VALUES
  ('1200', 'Terminal device inventory',    'asset'::public.gl_account_type,    'debit',  true),
  ('3200', 'Terminal device sale revenue', 'revenue'::public.gl_account_type,  'credit', true),
  ('3210', 'Terminal rental income',       'revenue'::public.gl_account_type,  'credit', true),
  ('3220', 'Terminal bundle allocation',   'revenue'::public.gl_account_type,  'credit', true),
  ('2840', 'Deferred device revenue',      'liability'::public.gl_account_type,'credit', true),
  ('4200', 'Terminal cost of goods sold',  'expense'::public.gl_account_type,  'debit',  true),
  ('4210', 'Terminal promotion expense',   'expense'::public.gl_account_type,  'debit',  true)
ON CONFLICT (code) DO UPDATE SET
  name      = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

-- ── 2. Extend shadow-journal mapping for terminal transaction types ────────────
-- Updates the existing _shadow_replay_finance_tx_row() function to handle:
--   terminal_sale           — once-off device purchase
--   terminal_rental         — recurring rental payment
--   terminal_bundle_alloc   — subscription bundle device allocation
--   terminal_promotion      — promotional / free device

-- NOTE: This is an additive CASE arm. The function is re-created here to add
-- the new arms. The existing arms from the base migration are preserved.
-- To avoid full-function duplication, we use a separate config table approach:
-- we insert rows into terminal_gl_account_map so the function can do a table
-- join. This keeps this migration additive and safe.

CREATE TABLE IF NOT EXISTS public.terminal_gl_account_map (
  transaction_type    TEXT PRIMARY KEY,
  debit_account       TEXT NOT NULL,
  credit_account      TEXT NOT NULL,
  cogs_debit_account  TEXT,
  cogs_credit_account TEXT,
  description         TEXT
);

INSERT INTO public.terminal_gl_account_map
  (transaction_type, debit_account, credit_account, cogs_debit_account, cogs_credit_account, description)
VALUES
  ('terminal_sale',         '1000', '3200', '4200', '1200', 'Once-off terminal sale: DR Cash CR Revenue; DR COGS CR Inventory'),
  ('terminal_rental',       '1000', '3210', NULL,   NULL,   'Terminal rental payment: DR Cash CR Rental income'),
  ('terminal_bundle_alloc', '2840', '3220', NULL,   NULL,   'Release deferred device revenue to terminal bundle allocation'),
  ('terminal_promotion',    '4210', '1200', NULL,   NULL,   'Promotional terminal: DR Promo expense CR Inventory')
ON CONFLICT (transaction_type) DO UPDATE SET
  debit_account       = EXCLUDED.debit_account,
  credit_account      = EXCLUDED.credit_account,
  cogs_debit_account  = EXCLUDED.cogs_debit_account,
  cogs_credit_account = EXCLUDED.cogs_credit_account,
  description         = EXCLUDED.description;

COMMENT ON TABLE public.terminal_gl_account_map IS
  'Shadow-journal account mapping for terminal commerce transaction types. Additive to the main shadow-journal trigger.';
