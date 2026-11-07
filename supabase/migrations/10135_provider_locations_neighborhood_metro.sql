-- Public place label for search suggestions (Mapbox neighborhood + metro city).
ALTER TABLE public.provider_locations
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS metro TEXT;

COMMENT ON COLUMN public.provider_locations.neighborhood IS 'Mapbox neighborhood/suburb at geocode time; not the apartment line (address_line2).';
COMMENT ON COLUMN public.provider_locations.metro IS 'Mapbox place/city metro at geocode time.';
