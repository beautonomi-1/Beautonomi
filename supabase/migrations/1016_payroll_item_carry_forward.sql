-- Pay run items: commission clawback and period carry-forward balances
ALTER TABLE public.provider_pay_run_items
  ADD COLUMN IF NOT EXISTS commission_clawback NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (commission_clawback >= 0),
  ADD COLUMN IF NOT EXISTS carry_forward_in NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (carry_forward_in >= 0),
  ADD COLUMN IF NOT EXISTS carry_forward_out NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.provider_pay_run_items.commission_clawback IS
  'Commission reversed in period (refund clawbacks), stored as a positive amount';
COMMENT ON COLUMN public.provider_pay_run_items.carry_forward_in IS
  'Prior-period net shortfall applied to this run (positive amount)';
COMMENT ON COLUMN public.provider_pay_run_items.carry_forward_out IS
  'Net shortfall carried to the next run (negative stored as positive out amount)';
