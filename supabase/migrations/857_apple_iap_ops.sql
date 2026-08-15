-- 857: Apple IAP ops — Connect finance reports, offer/price-increase state, grant-time audit

BEGIN;

ALTER TABLE public.platform_secrets
  ADD COLUMN IF NOT EXISTS apple_asc_vendor_number TEXT,
  ADD COLUMN IF NOT EXISTS apple_finance_region_code TEXT DEFAULT 'ZZ',
  ADD COLUMN IF NOT EXISTS apple_connect_issuer_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_connect_key_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_connect_private_key TEXT;

ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS apple_price_increase_status TEXT
    CHECK (apple_price_increase_status IS NULL OR apple_price_increase_status IN ('pending', 'consented', 'none')),
  ADD COLUMN IF NOT EXISTS apple_offer_identifier TEXT,
  ADD COLUMN IF NOT EXISTS apple_renewal_product_id TEXT;

ALTER TABLE public.apple_iap_transactions
  ADD COLUMN IF NOT EXISTS offer_identifier TEXT;

COMMIT;
