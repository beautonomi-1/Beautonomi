-- Feature gate: provider custom offers (default ON; superadmin can disable globally or per-tenant).
INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category, tenant_id, metadata)
SELECT
  'commerce.provider_custom_offers',
  'Provider custom offers',
  'Allow providers to create and send custom offers to customers (chat, custom requests, and direct create).',
  true,
  'commerce',
  NULL,
  '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags f
  WHERE f.feature_key = 'commerce.provider_custom_offers' AND f.tenant_id IS NULL
);

-- Traceability: link bookings created from custom offer payment to the offer row.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS custom_offer_id UUID REFERENCES public.custom_offers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_custom_offer_id ON public.bookings(custom_offer_id)
  WHERE custom_offer_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.custom_offer_id IS 'When set, this booking was created from payment on this custom offer (webhook / Paystack).';
