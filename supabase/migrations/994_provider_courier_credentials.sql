-- Provider-owned courier API credentials (encrypted at rest) + order booking audit fields.

CREATE TABLE IF NOT EXISTS public.provider_courier_credentials (
  provider_id UUID PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  courier_guy_ciphertext TEXT,
  bob_go_ciphertext TEXT,
  aramex_ciphertext TEXT,
  courier_guy_base_url TEXT,
  bob_go_base_url TEXT,
  aramex_base_url TEXT,
  aramex_account_entity TEXT,
  aramex_account_country_code TEXT,
  aramex_domestic_product_type TEXT DEFAULT 'ONP',
  courier_guy_verified_at TIMESTAMPTZ,
  bob_go_verified_at TIMESTAMPTZ,
  aramex_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.provider_courier_credentials IS
  'Salon-owned Courier Guy / Bob Go / Aramex secrets (AES-GCM ciphertext). Service role only.';

ALTER TABLE public.provider_courier_credentials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_provider_courier_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_provider_courier_credentials_updated_at ON public.provider_courier_credentials;
CREATE TRIGGER trg_provider_courier_credentials_updated_at
  BEFORE UPDATE ON public.provider_courier_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_courier_credentials_updated_at();

ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS shipping_booking_status TEXT
    CHECK (
      shipping_booking_status IS NULL
      OR shipping_booking_status IN ('booking', 'booked', 'skipped', 'failed', 'cancelled')
    ),
  ADD COLUMN IF NOT EXISTS shipping_booking_detail TEXT,
  ADD COLUMN IF NOT EXISTS courier_shipment_id TEXT,
  ADD COLUMN IF NOT EXISTS courier_label_url TEXT;

COMMENT ON COLUMN public.product_orders.shipping_booking_status IS
  'Live courier auto-book state for delivery orders.';
COMMENT ON COLUMN public.product_orders.courier_shipment_id IS
  'Courier API shipment id for cancel/label (when returned by adapter).';
