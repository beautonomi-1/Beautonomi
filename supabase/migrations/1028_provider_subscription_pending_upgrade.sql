-- Provider onboarding: record paid-plan intent while baseline free row is active.

ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS pending_upgrade_plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pending_upgrade_billing_period TEXT
    CHECK (pending_upgrade_billing_period IS NULL OR pending_upgrade_billing_period IN ('monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS pending_upgrade_set_at TIMESTAMPTZ;

COMMENT ON COLUMN public.provider_subscriptions.pending_upgrade_plan_id IS
  'Subscription plan the provider chose at onboarding or upgrade but has not paid for yet.';
COMMENT ON COLUMN public.provider_subscriptions.pending_upgrade_billing_period IS
  'Billing period for pending_upgrade_plan_id (monthly or yearly).';
COMMENT ON COLUMN public.provider_subscriptions.pending_upgrade_set_at IS
  'When pending upgrade intent was recorded; used for reminders and expiry.';

CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_pending_upgrade_set_at
  ON public.provider_subscriptions (pending_upgrade_set_at)
  WHERE pending_upgrade_plan_id IS NOT NULL;
