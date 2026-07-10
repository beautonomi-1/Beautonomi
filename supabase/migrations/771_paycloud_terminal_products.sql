-- Migration 771: PayCloud terminal products catalog seed (commerce bundle)
-- Adds Beautonomi-branded PayCloud card machines to terminal_products for shop/bundle flows.

-- terminal_products (748) has no free-form metadata column; add one so the catalog can
-- carry vendor-specific hints (e.g. terminal_model) used by PayCloud activation flows.
ALTER TABLE public.terminal_products
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO public.terminal_products (
  id,
  name,
  vendor,
  product_code,
  sku,
  description,
  upfront_price,
  monthly_price,
  rental_price,
  accounting_model,
  fulfillment_type,
  currency,
  active,
  subscription_plan_eligible,
  requires_integration_setup,
  integration_vendor_slug,
  stock_status,
  metadata
)
SELECT
  gen_random_uuid(),
  'Beautonomi Card Machine',
  'paycloud',
  'PAYCLOUD_SMART_POS',
  'BN-PAYCLOUD-01',
  'Whitelabel in-person card machine — tap, insert, swipe, and QR wallets. Cloud Mode setup included.',
  2499.00,
  NULL,
  299.00,
  'once_off_purchase',
  'digital_activation',
  'ZAR',
  true,
  true,
  true,
  'paycloud',
  'in_stock',
  '{"terminal_model":"paycloud","whitelabel":true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.terminal_products
  WHERE integration_vendor_slug = 'paycloud' AND product_code = 'PAYCLOUD_SMART_POS'
);

INSERT INTO public.terminal_products (
  id,
  name,
  vendor,
  product_code,
  sku,
  description,
  upfront_price,
  monthly_price,
  rental_price,
  accounting_model,
  fulfillment_type,
  currency,
  active,
  subscription_plan_eligible,
  requires_integration_setup,
  integration_vendor_slug,
  stock_status,
  metadata
)
SELECT
  gen_random_uuid(),
  'Beautonomi Card Machine (Rental)',
  'paycloud',
  'PAYCLOUD_SMART_POS_RENT',
  'BN-PAYCLOUD-RENT',
  'Rent a Beautonomi card machine — single upfront rental charge; ongoing use via your plan.',
  NULL,
  NULL,
  299.00,
  'rental',
  'courier',
  'ZAR',
  true,
  true,
  true,
  'paycloud',
  'in_stock',
  '{"terminal_model":"paycloud","whitelabel":true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.terminal_products
  WHERE integration_vendor_slug = 'paycloud' AND product_code = 'PAYCLOUD_SMART_POS_RENT'
);

COMMENT ON TABLE public.terminal_products IS
  'Terminal hardware catalog; PayCloud products use integration_vendor_slug=paycloud and digital_activation fulfillment.';
