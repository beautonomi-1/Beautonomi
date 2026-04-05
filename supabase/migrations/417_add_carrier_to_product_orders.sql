-- Add carrier column to product_orders so providers can record the shipping carrier
-- alongside the tracking number when marking an order as shipped.
ALTER TABLE product_orders
  ADD COLUMN IF NOT EXISTS carrier TEXT;
