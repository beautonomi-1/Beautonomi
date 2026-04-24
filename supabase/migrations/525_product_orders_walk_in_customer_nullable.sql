-- Walk-in retail product orders are recorded without a customer account when the
-- buyer is anonymous; `customer_name` / `customer_phone` hold receipt details.
-- Align the schema with POST /api/provider/product-sales (customer_id optional).
ALTER TABLE public.product_orders
  ALTER COLUMN customer_id DROP NOT NULL;

COMMENT ON COLUMN public.product_orders.customer_id IS
  'Customer user id when known; NULL for anonymous walk-in sales (see customer_name / customer_phone).';
