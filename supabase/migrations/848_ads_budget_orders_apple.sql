-- 848: Apple payment columns on ads_budget_orders

BEGIN;

ALTER TABLE public.ads_budget_orders
  ADD COLUMN IF NOT EXISTS apple_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'paystack'
    CHECK (payment_provider IN ('paystack', 'apple'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ads_budget_orders_apple_tx
  ON public.ads_budget_orders (apple_transaction_id)
  WHERE apple_transaction_id IS NOT NULL;

COMMIT;
