-- Allow product_orders.payment_status = 'partially_refunded'.
--
-- §Orders-audit 2026-06: the admin e-commerce UI ("Partial Refund") and the
-- PATCH /api/admin/product-orders/[id] handler both accept
-- payment_status = 'partially_refunded', but the original CHECK constraint from
-- migration 232 only permitted ('pending','paid','failed','refunded'). Saving a
-- partial refund therefore failed with a CHECK violation. Widen the constraint
-- so partial refunds persist, matching the global `payment_status` enum
-- (001_initial_schema) which already includes 'partially_refunded'.

ALTER TABLE public.product_orders
  DROP CONSTRAINT IF EXISTS product_orders_payment_status_check;

ALTER TABLE public.product_orders
  ADD CONSTRAINT product_orders_payment_status_check
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded'));
