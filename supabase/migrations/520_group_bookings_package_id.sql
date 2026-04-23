-- §Provider-audit 2026-04 (packages round 2): group bookings can be created
-- from a service package but we previously had nowhere to store the link.
-- The provider-web GroupBookingDialog expanded package contents into
-- participants + products but never persisted which package drove the
-- booking, so package-level reporting and discount math was lost.
--
-- Add a nullable `package_id` FK on `group_bookings`. Single bookings
-- (`bookings.package_id`) already reference `service_packages(id)` the same
-- way.

ALTER TABLE group_bookings
ADD COLUMN IF NOT EXISTS package_id UUID NULL REFERENCES service_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_bookings_package_id ON group_bookings(package_id);

COMMENT ON COLUMN group_bookings.package_id IS
  'Optional link to service_packages when this group booking was created from a package. Mirrors bookings.package_id.';
