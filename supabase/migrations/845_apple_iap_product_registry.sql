-- 845: Apple IAP product registry + mirror columns on plans/packs

BEGIN;

CREATE TABLE IF NOT EXISTS public.apple_iap_products (
  product_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('subscription', 'consumable')),
  ref_table TEXT NOT NULL,
  ref_id UUID,
  ref_key TEXT,
  apple_price_zar NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (apple_price_zar >= 0),
  apple_price_point NUMERIC(12, 2),
  subscription_group_level INTEGER CHECK (subscription_group_level IS NULL OR subscription_group_level > 0),
  reference_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  asc_synced_at TIMESTAMPTZ,
  asc_reported_price_zar NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apple_iap_products_kind ON public.apple_iap_products (kind);
CREATE INDEX IF NOT EXISTS idx_apple_iap_products_ref ON public.apple_iap_products (ref_table, ref_id);

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS apple_product_id_monthly TEXT,
  ADD COLUMN IF NOT EXISTS apple_product_id_yearly TEXT;

ALTER TABLE public.ads_time_packs
  ADD COLUMN IF NOT EXISTS apple_product_id TEXT;

ALTER TABLE public.ads_impression_packs
  ADD COLUMN IF NOT EXISTS apple_product_id TEXT;

-- Seed subscription product IDs from plan slugs
UPDATE public.subscription_plans sp
SET
  apple_product_id_monthly = 'com.beautonomi.partner.sub.' || REPLACE(sp.slug, 'beautonomi-', '') || '.monthly',
  apple_product_id_yearly = 'com.beautonomi.partner.sub.' || REPLACE(sp.slug, 'beautonomi-', '') || '.yearly'
WHERE sp.is_free = false
  AND sp.slug IN ('beautonomi-growth', 'beautonomi-scale');

UPDATE public.ads_time_packs tp
SET apple_product_id = 'com.beautonomi.partner.ads.time.' || tp.duration_days || 'd'
WHERE tp.is_active = true;

UPDATE public.ads_impression_packs ip
SET apple_product_id = 'com.beautonomi.partner.ads.impressions.' || ip.impressions
WHERE ip.is_active = true;

INSERT INTO public.apple_iap_products (
  product_id, kind, ref_table, ref_key, apple_price_zar, apple_price_point,
  subscription_group_level, reference_name, display_name, description
) VALUES
  ('com.beautonomi.partner.sub.growth.monthly', 'subscription', 'subscription_plans', 'beautonomi-growth:monthly', 116.47, 119.99, 2, 'Beautonomi Growth Monthly', 'Growth Monthly', 'Bookings, team and marketing tools.'),
  ('com.beautonomi.partner.sub.growth.yearly', 'subscription', 'subscription_plans', 'beautonomi-growth:yearly', 1164.71, 1199.99, 2, 'Beautonomi Growth Yearly', 'Growth Yearly', 'Bookings, team and marketing. Billed yearly.'),
  ('com.beautonomi.partner.sub.scale.monthly', 'subscription', 'subscription_plans', 'beautonomi-scale:monthly', 351.76, 399.99, 1, 'Beautonomi Scale Monthly', 'Scale Monthly', 'Multi-location, ads and advanced reports.'),
  ('com.beautonomi.partner.sub.scale.yearly', 'subscription', 'subscription_plans', 'beautonomi-scale:yearly', 3517.65, 3999.99, 1, 'Beautonomi Scale Yearly', 'Scale Yearly', 'Multi-location and ads. Billed yearly.'),
  ('com.beautonomi.partner.ads.time.1d', 'consumable', 'ads_time_packs', '1', 34.12, 34.99, NULL, 'Ads Time Pack 1 Day', '1 Day Ad Boost', 'Featured placement for 24 hours.'),
  ('com.beautonomi.partner.ads.time.3d', 'consumable', 'ads_time_packs', '3', 81.18, 89.99, NULL, 'Ads Time Pack 3 Days', '3 Day Ad Boost', 'Featured placement for 3 days.'),
  ('com.beautonomi.partner.ads.time.7d', 'consumable', 'ads_time_packs', '7', 175.29, 179.99, NULL, 'Ads Time Pack 7 Days', '7 Day Ad Boost', 'Featured placement for 7 days.'),
  ('com.beautonomi.partner.ads.time.14d', 'consumable', 'ads_time_packs', '14', 292.94, 299.99, NULL, 'Ads Time Pack 14 Days', '14 Day Ad Boost', 'Featured placement for 14 days.'),
  ('com.beautonomi.partner.ads.time.30d', 'consumable', 'ads_time_packs', '30', 469.41, 499.99, NULL, 'Ads Time Pack 30 Days', '30 Day Ad Boost', 'Featured placement for 30 days.'),
  ('com.beautonomi.partner.ads.impressions.50', 'consumable', 'ads_impression_packs', '50', 29.41, 29.99, NULL, 'Ads Impression Pack 50', '50 Ad Impressions', '50 sponsored impressions in search.'),
  ('com.beautonomi.partner.ads.impressions.100', 'consumable', 'ads_impression_packs', '100', 52.94, 59.99, NULL, 'Ads Impression Pack 100', '100 Ad Impressions', '100 sponsored impressions in search.'),
  ('com.beautonomi.partner.ads.impressions.500', 'consumable', 'ads_impression_packs', '500', 235.29, 249.99, NULL, 'Ads Impression Pack 500', '500 Ad Impressions', '500 sponsored impressions in search.'),
  ('com.beautonomi.partner.ads.impressions.1000', 'consumable', 'ads_impression_packs', '1000', 411.76, 449.99, NULL, 'Ads Impression Pack 1000', '1000 Ad Impressions', '1000 sponsored impressions in search.')
ON CONFLICT (product_id) DO UPDATE SET
  apple_price_zar = EXCLUDED.apple_price_zar,
  apple_price_point = EXCLUDED.apple_price_point,
  updated_at = NOW();

ALTER TABLE public.platform_secrets
  ADD COLUMN IF NOT EXISTS apple_app_store_issuer_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_app_store_key_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_app_store_private_key TEXT,
  ADD COLUMN IF NOT EXISTS apple_app_store_bundle_id TEXT DEFAULT 'com.beautonomi.partner',
  ADD COLUMN IF NOT EXISTS apple_iap_commission_rate NUMERIC(5, 4) DEFAULT 0.15;

COMMIT;
