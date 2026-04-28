ALTER TABLE public.provider_subscription_orders
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

COMMENT ON COLUMN public.provider_subscription_orders.failed_at IS
  'When the subscription checkout attempt failed.';

COMMENT ON COLUMN public.provider_subscription_orders.failure_reason IS
  'Gateway or app-facing reason for a failed subscription checkout, e.g. insufficient funds.';
