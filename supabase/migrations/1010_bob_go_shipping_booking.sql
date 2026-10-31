-- Bob Go async submission + salon courier charge audit fields.

ALTER TABLE public.product_orders
  DROP CONSTRAINT IF EXISTS product_orders_shipping_booking_status_check;

ALTER TABLE public.product_orders
  ADD CONSTRAINT product_orders_shipping_booking_status_check
  CHECK (
    shipping_booking_status IS NULL
    OR shipping_booking_status IN (
      'booking',
      'submitting',
      'booked',
      'skipped',
      'failed',
      'cancelled'
    )
  );

ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS courier_charged_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS courier_charged_weight_kg NUMERIC;

COMMENT ON COLUMN public.product_orders.courier_charged_amount IS
  'Amount Bob Go charged the salon for this shipment (ZAR), when known.';
COMMENT ON COLUMN public.product_orders.courier_charged_weight_kg IS
  'Weight Bob Go charged for this shipment (kg), when known.';

ALTER TABLE public.provider_courier_credentials
  ADD COLUMN IF NOT EXISTS bob_go_webhook_secret_ciphertext TEXT;
