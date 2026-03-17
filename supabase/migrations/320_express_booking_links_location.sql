-- Express booking links: pre-select venue (at salon branch or at home)
ALTER TABLE public.express_booking_links
  ADD COLUMN IF NOT EXISTS location_id UUID NULL REFERENCES public.provider_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_type TEXT NULL;

ALTER TABLE public.express_booking_links
  DROP CONSTRAINT IF EXISTS express_booking_links_location_type_check;

ALTER TABLE public.express_booking_links
  ADD CONSTRAINT express_booking_links_location_type_check
  CHECK (location_type IS NULL OR location_type IN ('at_salon', 'at_home'));

COMMENT ON COLUMN public.express_booking_links.location_id IS 'Pre-selected salon location (provider_locations). Only when location_type = at_salon.';
COMMENT ON COLUMN public.express_booking_links.location_type IS 'Pre-selected venue: at_salon (use location_id if set) or at_home (house call). Null = customer chooses.';
