-- Provider promo: optional end date + one use per customer flag.
-- Checkout already treats NULL valid_until as open-ended.

ALTER TABLE public.promotions
  ALTER COLUMN valid_until DROP NOT NULL;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS once_per_customer BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.promotions.once_per_customer IS
  'When true, each customer may redeem this promotion at most once (any booking or product order).';
