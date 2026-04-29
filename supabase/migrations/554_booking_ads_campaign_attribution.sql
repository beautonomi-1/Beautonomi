-- Persist paid-discovery campaign attribution directly on bookings so ad
-- performance can reconcile campaign events with booking/accounting records.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS ads_campaign_id UUID REFERENCES public.ads_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ads_attribution JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_bookings_ads_campaign_id
  ON public.bookings (ads_campaign_id)
  WHERE ads_campaign_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.ads_campaign_id IS
  'Paid discovery ads campaign that led to this booking, when known.';
COMMENT ON COLUMN public.bookings.ads_attribution IS
  'Structured ad attribution context captured at booking creation time.';
