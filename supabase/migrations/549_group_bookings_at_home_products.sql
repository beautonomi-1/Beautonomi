-- Persist at-home logistics and retail lines on provider-created group bookings.
-- The UI already collected these fields, but the group row only stored salon
-- location_id/package metadata, so at-home address pins and product totals were lost.

ALTER TABLE public.group_bookings
  ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT 'at_salon',
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_state TEXT,
  ADD COLUMN IF NOT EXISTS address_country TEXT,
  ADD COLUMN IF NOT EXISTS address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS address_latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS address_longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS address_place_name TEXT,
  ADD COLUMN IF NOT EXISTS travel_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS products JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(10, 2);

ALTER TABLE public.group_bookings
  DROP CONSTRAINT IF EXISTS group_bookings_location_type_check;

ALTER TABLE public.group_bookings
  ADD CONSTRAINT group_bookings_location_type_check
  CHECK (location_type IN ('at_salon', 'at_home'));

CREATE INDEX IF NOT EXISTS idx_group_bookings_location_type
  ON public.group_bookings(provider_id, location_type);

COMMENT ON COLUMN public.group_bookings.products IS
  'Retail product lines attached to a provider-created group booking. Stored as JSON until group-level inventory/payment tables exist.';
