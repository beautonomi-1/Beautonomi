-- Migration 774: Option C terminal commerce — remove standalone rental SKU from shop
-- Non-ownership is via subscription_bundle only; buy SKU no longer carries rental_price.

UPDATE public.terminal_products
SET active = false
WHERE integration_vendor_slug = 'paycloud'
  AND product_code = 'PAYCLOUD_SMART_POS_RENT';

UPDATE public.terminal_products
SET rental_price = NULL
WHERE integration_vendor_slug = 'paycloud'
  AND product_code = 'PAYCLOUD_SMART_POS';
