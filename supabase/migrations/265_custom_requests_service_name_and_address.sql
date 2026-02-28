-- Add service_name and address fields to custom_requests for at_home offers and booking creation
ALTER TABLE custom_requests
  ADD COLUMN IF NOT EXISTS service_name TEXT,
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_state TEXT,
  ADD COLUMN IF NOT EXISTS address_country TEXT,
  ADD COLUMN IF NOT EXISTS address_postal_code TEXT;

COMMENT ON COLUMN custom_requests.service_name IS 'Short display name for the service (e.g. "Haircut & Styling"). Used as offering title when offer is accepted.';
COMMENT ON COLUMN custom_requests.address_line1 IS 'For at_home: street address when creating booking from accepted offer.';
