-- Store membership purchase attribution alongside the pending order so Paystack
-- metadata, activation records, and accounting traces remain reconcilable.
ALTER TABLE public.membership_orders
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_membership_orders_metadata_gin
  ON public.membership_orders USING GIN (metadata);
