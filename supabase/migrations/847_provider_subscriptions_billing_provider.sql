-- 847: billing_provider on provider_subscriptions

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_provider_enum') THEN
    CREATE TYPE public.billing_provider_enum AS ENUM ('paystack', 'apple', 'manual');
  END IF;
END $$;

ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS billing_provider public.billing_provider_enum NOT NULL DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_product_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_environment TEXT CHECK (apple_environment IS NULL OR apple_environment IN ('Production', 'Sandbox')),
  ADD COLUMN IF NOT EXISTS apple_auto_renew_status BOOLEAN,
  ADD COLUMN IF NOT EXISTS apple_grace_period_expires_at TIMESTAMPTZ;

UPDATE public.provider_subscriptions
SET billing_provider = 'paystack'
WHERE billing_provider IS NULL;

CREATE INDEX IF NOT EXISTS idx_provider_subs_billing_provider
  ON public.provider_subscriptions (billing_provider);

CREATE INDEX IF NOT EXISTS idx_provider_subs_apple_original
  ON public.provider_subscriptions (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

COMMIT;
