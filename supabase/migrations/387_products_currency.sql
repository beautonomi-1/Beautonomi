-- Optional per-product ISO 4217 code; when null, tenant/default currency applies (see public API).
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS currency TEXT;

COMMENT ON COLUMN public.products.currency IS 'Optional ISO 4217 override for retail price display; NULL means use tenant default.';
