-- Allow product orders to be paid (partially or fully) with customer wallet
ALTER TABLE product_orders ADD COLUMN IF NOT EXISTS wallet_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (wallet_amount >= 0);
COMMENT ON COLUMN product_orders.wallet_amount IS 'Amount paid from customer wallet for this order';
