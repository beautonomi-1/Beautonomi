ALTER TABLE public.ads_impression_packs
  ADD COLUMN IF NOT EXISTS price_minor BIGINT,
  ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE public.ads_impression_packs
SET
  price_minor = COALESCE(price_minor, (price_zar * 100)::BIGINT),
  currency = COALESCE(NULLIF(currency, ''), 'ZAR')
WHERE price_zar IS NOT NULL;
