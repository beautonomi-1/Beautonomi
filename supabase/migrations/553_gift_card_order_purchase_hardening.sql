-- Gift card purchase orders need bulk-purchase totals and durable attribution
-- for payment reconciliation, notifications, and liability accounting.
ALTER TABLE public.gift_card_orders
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.gift_card_orders
SET total_amount = amount * quantity
WHERE total_amount IS NULL;

ALTER TABLE public.gift_card_orders
  ALTER COLUMN total_amount SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gift_card_orders_metadata_gin
  ON public.gift_card_orders USING GIN (metadata);
