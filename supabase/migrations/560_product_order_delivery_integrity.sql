-- 560_product_order_delivery_integrity.sql
--
-- Commercial integrity follow-up: persist the delivery fee basis used at
-- product checkout and allow providers to opt into a configured courier
-- adapter without making courier booking mandatory.

ALTER TABLE public.provider_shipping_config
  ADD COLUMN IF NOT EXISTS shipping_provider_preference TEXT
    CHECK (shipping_provider_preference IS NULL OR shipping_provider_preference IN ('aramex', 'courier-guy', 'bob-go'));

ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS delivery_fee_type TEXT DEFAULT 'flat'
    CHECK (delivery_fee_type IN ('flat', 'weight_based', 'distance_based')),
  ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(8,2);

COMMENT ON COLUMN public.provider_shipping_config.shipping_provider_preference IS
  'Optional configured courier adapter. NULL means provider manages delivery/tracking manually.';

COMMENT ON COLUMN public.product_orders.delivery_fee_type IS
  'Delivery fee model applied at checkout: flat, weight_based, or distance_based.';

COMMENT ON COLUMN public.product_orders.delivery_distance_km IS
  'Distance used for distance-based delivery fee calculation when coordinates were available.';
