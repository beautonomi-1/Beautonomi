-- Beautonomi: Support mobile-only freelancers (no physical salon).
-- Location is always needed for distance/travel calculation; providers can have:
-- - location_type = 'salon': physical venue, accepts at_salon bookings and walk-ins.
-- - location_type = 'base': base/service area point only (e.g. home), used for distance/travel; no at_salon.
-- This allows freelancers to provide only house calls while still having a location for distance.

ALTER TABLE provider_locations
  ADD COLUMN IF NOT EXISTS location_type TEXT NOT NULL DEFAULT 'salon'
  CHECK (location_type IN ('salon', 'base'));

COMMENT ON COLUMN provider_locations.location_type IS 'salon = physical venue for at_salon bookings; base = reference point for distance/travel only (mobile-only providers).';

-- Index for "has at least one salon" and for filtering salon vs base
CREATE INDEX IF NOT EXISTS idx_provider_locations_type_active
  ON provider_locations(provider_id, location_type, is_active)
  WHERE is_active = true;

-- Backfill: freelancers with a single location named "Home Location" are likely mobile-only
UPDATE provider_locations pl
SET location_type = 'base'
FROM providers p
WHERE pl.provider_id = p.id
  AND p.business_type = 'freelancer'
  AND pl.location_type = 'salon'
  AND (pl.name ILIKE '%home%' OR pl.name ILIKE '%base%')
  AND NOT EXISTS (
    SELECT 1 FROM provider_locations pl2
    WHERE pl2.provider_id = pl.provider_id AND pl2.is_active = true AND pl2.id != pl.id
  );
