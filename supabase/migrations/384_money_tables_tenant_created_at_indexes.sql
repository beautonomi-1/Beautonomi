-- Phase A (spec §1.3 / §6.6): composite indexes for tenant-scoped time-ordered queries.
-- 376 added single-column tenant_id indexes; 381 added booking_payments (tenant_id, created_at).
-- Idempotent CREATE INDEX IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_finance_transactions_tenant_created_at
  ON public.finance_transactions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_membership_orders_tenant_created_at
  ON public.membership_orders (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_orders_tenant_created_at
  ON public.product_orders (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_tenant_created_at
  ON public.provider_subscriptions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tenant_created_at
  ON public.wallet_transactions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gift_card_orders_tenant_created_at
  ON public.gift_card_orders (tenant_id, created_at DESC);

-- Bookings: complements idx_bookings_tenant_scheduled (332) for created-at report slices.
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_created_at
  ON public.bookings (tenant_id, created_at DESC);
