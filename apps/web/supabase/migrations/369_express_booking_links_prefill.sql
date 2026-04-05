-- Optional marketing/checkout prefill for express short links (addons, promo, gift card, retail cart).
ALTER TABLE public.express_booking_links
  ADD COLUMN IF NOT EXISTS prefill jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.express_booking_links.prefill IS
  'JSON: { "addon_ids"?: uuid[], "promotion_code"?: string, "gift_card_code"?: string, "product_cart"?: [{ "product_id", "quantity", "product_variant_id"? }] }';
