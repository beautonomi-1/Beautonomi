-- 976: Stripe billing + online checkout registry for gateway-agnostic verify/settlement

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'billing_provider_enum'
      AND e.enumlabel = 'stripe'
  ) THEN
    ALTER TYPE public.billing_provider_enum ADD VALUE 'stripe';
  END IF;
END $$;

ALTER TABLE public.ads_budget_orders
  DROP CONSTRAINT IF EXISTS ads_budget_orders_payment_provider_check;

ALTER TABLE public.ads_budget_orders
  ADD CONSTRAINT ads_budget_orders_payment_provider_check
  CHECK (payment_provider IN ('paystack', 'apple', 'stripe'));

ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;

CREATE TABLE IF NOT EXISTS public.online_payment_checkouts (
  reference TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('paystack', 'stripe')),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  checkout_session_id TEXT,
  payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_payment_checkouts_tenant
  ON public.online_payment_checkouts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_online_payment_checkouts_pi
  ON public.online_payment_checkouts (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

CREATE TRIGGER update_online_payment_checkouts_updated_at
  BEFORE UPDATE ON public.online_payment_checkouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.online_payment_checkouts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'online_payment_checkouts'
      AND policyname = 'Service role full access online_payment_checkouts'
  ) THEN
    CREATE POLICY "Service role full access online_payment_checkouts"
      ON public.online_payment_checkouts FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMIT;
