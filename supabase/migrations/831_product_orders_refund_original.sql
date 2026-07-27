-- Migration 831: Allow 'original' refund_method on product_orders (terminal/gateway reversals).
ALTER TABLE public.product_orders
  DROP CONSTRAINT IF EXISTS product_orders_refund_method_check;

ALTER TABLE public.product_orders
  ADD CONSTRAINT product_orders_refund_method_check
  CHECK (refund_method IS NULL OR refund_method IN ('cash', 'store_credit', 'original'));
